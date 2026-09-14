"""
FastAPI service around FaceRecognitionModel.
Auth, roster storage, and attendance records all live in Supabase:
  - Auth        -> Supabase Auth (teacher / developer accounts + `profiles.role`)
  - Roster      -> Supabase Storage bucket "known-faces" (photo = source of truth)
  - Attendance  -> Supabase Postgres table "attendance"

Run:  uvicorn api:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

import io
import os
from datetime import datetime

import face_recognition
from fastapi import Depends, FastAPI, Header, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from face_model import FaceRecognitionModel
from supabase_client import anon_client, client_as, BUCKET

app = FastAPI(title="Face Recognition API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = FaceRecognitionModel()
model.load()  # syncs from Storage + builds/loads encoding cache at startup

ROLE_RANK = {"teacher": 1, "developer": 2}


# ---------- auth helpers ----------
def get_token(authorization: str | None = Header(default=None)) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1]


def get_role(token: str | None = Depends(get_token)) -> str | None:
    if not token:
        return None
    sb = client_as(token)
    try:
        user = sb.auth.get_user(token).user
    except Exception:
        return None
    if not user:
        return None
    res = sb.table("profiles").select("role").eq("id", user.id).single().execute()
    return res.data["role"] if res.data else None


def require_role(min_role: str):
    """Dependency factory. Validates the bearer token + role, and hands the
    endpoint the raw token back (needed to make Supabase calls as that user
    so RLS policies apply correctly)."""

    def dependency(
        token: str | None = Depends(get_token),
        role: str | None = Depends(get_role),
    ) -> str:
        if role is None:
            raise HTTPException(401, detail="login required")
        if ROLE_RANK.get(role, 0) < ROLE_RANK[min_role]:
            raise HTTPException(403, detail=f"{min_role} access required")
        return token

    return dependency


require_teacher = require_role("teacher")  # teacher or developer
require_developer = require_role("developer")  # developer only


# ---------- models ----------
class MatchResult(BaseModel):
    name: str
    distance: float | None
    box: list[int] | None  # [top, right, bottom, left]


class RecognizeResponse(BaseModel):
    faces: list[MatchResult]
    logged: list[str]


class AttendanceRecord(BaseModel):
    id: int
    name: str
    date: str
    time: str
    status: str


class AttendanceStatusUpdate(BaseModel):
    status: str  # "present" | "absent"


class KnownFace(BaseModel):
    name: str
    image_url: str


class RenameStudent(BaseModel):
    new_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ---------- health ----------
@app.get("/health")
def health():
    return {"status": "ok", "known_faces": len(model.names)}


# ---------- auth (thin passthrough to Supabase Auth) ----------
@app.post("/login")
def login(body: LoginRequest):
    sb = anon_client()
    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as exc:
        raise HTTPException(401, detail=str(exc))
    profile = sb.table("profiles").select("role").eq("id", res.user.id).single().execute()
    if not profile.data:
        raise HTTPException(403, detail="account has no assigned role — ask a developer to add one")
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "email": res.user.email,
        "role": profile.data["role"],
    }


@app.get("/me")
def me(role: str | None = Depends(get_role)):
    if role is None:
        raise HTTPException(401, detail="login required")
    return {"role": role}


# ---------- roster ----------
@app.get("/faces", response_model=list[KnownFace])
def list_faces():
    sb = anon_client()
    objects = sb.storage.from_(BUCKET).list()
    faces = []
    for obj in sorted(objects, key=lambda o: o["name"]):
        fname = obj["name"]
        if fname.lower().endswith((".jpg", ".jpeg", ".png")):
            name = os.path.splitext(fname)[0]
            url = sb.storage.from_(BUCKET).get_public_url(fname)
            faces.append(KnownFace(name=name, image_url=url))
    return faces


@app.post("/register")
async def register(
    name: str = Form(...),
    file: UploadFile = File(...),
    token: str = Depends(require_teacher),
):
    suffix = os.path.splitext(file.filename or "")[1] or ".jpg"
    contents = await file.read()

    # validate a face is actually detectable before uploading
    img = face_recognition.load_image_file(io.BytesIO(contents))
    if not face_recognition.face_encodings(img):
        raise HTTPException(400, detail="no face detected in image")

    sb = client_as(token)
    path = f"{name}{suffix}"
    try:
        sb.storage.from_(BUCKET).upload(
            path, contents, {"content-type": file.content_type or "image/jpeg", "upsert": "true"}
        )
    except Exception as exc:
        raise HTTPException(400, detail=f"upload failed: {exc}")

    model.load()  # re-sync + re-encode, picks up the new photo
    return {"registered": name, "known_faces": len(model.names)}


@app.put("/faces/{name}")
def rename_face(name: str, body: RenameStudent, token: str = Depends(require_teacher)):
    """Teacher or developer: correct a student's name on the roster."""
    sb = client_as(token)
    objects = sb.storage.from_(BUCKET).list()
    match = next((o for o in objects if os.path.splitext(o["name"])[0] == name), None)
    if not match:
        raise HTTPException(404, detail="student not found")
    ext = os.path.splitext(match["name"])[1]
    new_path = f"{body.new_name}{ext}"
    if any(os.path.splitext(o["name"])[0] == body.new_name for o in objects):
        raise HTTPException(409, detail="a student with that name already exists")

    try:
        sb.storage.from_(BUCKET).move(match["name"], new_path)
    except Exception as exc:
        raise HTTPException(400, detail=f"rename failed: {exc}")

    # keep historical attendance rows pointing at the new name
    sb.table("attendance").update({"name": body.new_name}).eq("name", name).execute()

    model.load()
    return {"renamed": name, "to": body.new_name}


@app.delete("/faces/{name}")
def delete_face(name: str, token: str = Depends(require_developer)):
    """Developer only: remove a student and their photo entirely."""
    sb = client_as(token)
    objects = sb.storage.from_(BUCKET).list()
    match = next((o for o in objects if os.path.splitext(o["name"])[0] == name), None)
    if not match:
        raise HTTPException(404, detail="student not found")
    try:
        sb.storage.from_(BUCKET).remove([match["name"]])
    except Exception as exc:
        raise HTTPException(400, detail=f"delete failed: {exc}")

    model.load()
    return {"deleted": name}


@app.post("/reload")
def reload_cache():
    """Force re-sync from Storage + re-encode (e.g. after editing the bucket directly)."""
    model.load()
    return {"known_faces": len(model.names)}


# ---------- recognition / attendance ----------
@app.post("/recognize", response_model=RecognizeResponse)
async def recognize(file: UploadFile = File(...), mark_attendance: bool = Form(True)):
    contents = await file.read()
    img = face_recognition.load_image_file(io.BytesIO(contents))

    locations = face_recognition.face_locations(img)
    encodings = face_recognition.face_encodings(img, locations)

    results = []
    logged = []
    sb = anon_client() if mark_attendance else None

    for loc, enc in zip(locations, encodings):
        name, dist = model.match(enc)
        final_name = name or "Unknown"
        results.append(MatchResult(name=final_name, distance=dist, box=list(loc)))

        if mark_attendance and final_name != "Unknown":
            now = datetime.now()
            try:
                sb.table("attendance").insert(
                    {
                        "name": final_name,
                        "date": now.strftime("%Y-%m-%d"),
                        "time": now.strftime("%H:%M:%S"),
                        "status": "present",
                    }
                ).execute()
                logged.append(final_name)
            except Exception:
                pass  # already logged today (unique constraint) or transient error

    return RecognizeResponse(faces=results, logged=logged)


@app.get("/attendance", response_model=list[AttendanceRecord])
def get_attendance(date: str | None = None):
    sb = anon_client()
    q = sb.table("attendance").select("*")
    if date:
        q = q.eq("date", date).order("time", desc=True)
    else:
        q = q.order("date", desc=True).order("time", desc=True).limit(200)
    rows = q.execute().data
    return [
        AttendanceRecord(id=r["id"], name=r["name"], date=str(r["date"]), time=str(r["time"]), status=r["status"])
        for r in rows
    ]


@app.get("/attendance/dates", response_model=list[str])
def get_attendance_dates():
    sb = anon_client()
    rows = sb.table("attendance").select("date").order("date", desc=True).execute().data
    seen, dates = set(), []
    for r in rows:
        d = str(r["date"])
        if d not in seen:
            seen.add(d)
            dates.append(d)
    return dates


@app.patch("/attendance/{record_id}", response_model=AttendanceRecord)
def set_attendance_status(record_id: int, body: AttendanceStatusUpdate, token: str = Depends(require_teacher)):
    """Manual override — teacher or developer can flip Present/Absent."""
    if body.status not in ("present", "absent"):
        raise HTTPException(400, detail="status must be 'present' or 'absent'")
    sb = client_as(token)
    res = sb.table("attendance").update({"status": body.status}).eq("id", record_id).execute()
    if not res.data:
        raise HTTPException(404, detail="attendance record not found")
    r = res.data[0]
    return AttendanceRecord(id=r["id"], name=r["name"], date=str(r["date"]), time=str(r["time"]), status=r["status"])


@app.delete("/attendance/{record_id}")
def delete_attendance(record_id: int, token: str = Depends(require_developer)):
    sb = client_as(token)
    res = sb.table("attendance").delete().eq("id", record_id).execute()
    if not res.data:
        raise HTTPException(404, detail="attendance record not found")
    return {"deleted": record_id}
