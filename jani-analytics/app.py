"""
Jani Analytics - FastAPI Server
"""
import os
import json
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
import aiofiles

from analytics import load_backup_to_sqlite, Analytics, UPLOADS_DIR

app = FastAPI(title="Jani Analytics")

# Статические файлы
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Хранилище загруженных бэкапов
BACKUPS: dict = {}  # {backup_id: {'name': str, 'path': Path, 'db_path': Path, 'uploaded_at': str}}


@app.get("/", response_class=HTMLResponse)
async def root():
    """Главная страница"""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        async with aiofiles.open(index_path, 'r') as f:
            return await f.read()
    return "<h1>Jani Analytics</h1><p>Static files not found</p>"


@app.post("/api/upload")
async def upload_backup(file: UploadFile = File(...)):
    """Загрузка бэкапа"""
    if not file.filename:
        raise HTTPException(400, "No file provided")
    
    # Генерируем ID
    backup_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Сохраняем файл
    file_path = UPLOADS_DIR / f"{backup_id}_{file.filename}"
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    # Парсим и загружаем в SQLite
    db_path = UPLOADS_DIR / f"{backup_id}.db"
    try:
        conn = load_backup_to_sqlite(file_path, db_path)
        conn.close()
    except Exception as e:
        # Удаляем файлы при ошибке
        file_path.unlink(missing_ok=True)
        db_path.unlink(missing_ok=True)
        raise HTTPException(400, f"Failed to parse backup: {str(e)}")
    
    # Сохраняем метаданные
    BACKUPS[backup_id] = {
        'name': file.filename,
        'path': file_path,
        'db_path': db_path,
        'uploaded_at': datetime.now().isoformat()
    }
    
    return {"id": backup_id, "name": file.filename}


@app.get("/api/backups")
async def list_backups():
    """Список загруженных бэкапов"""
    # Также ищем существующие DB файлы
    result = []
    for db_file in UPLOADS_DIR.glob("*.db"):
        backup_id = db_file.stem
        if backup_id in BACKUPS:
            result.append({
                'id': backup_id,
                'name': BACKUPS[backup_id]['name'],
                'uploaded_at': BACKUPS[backup_id]['uploaded_at']
            })
        else:
            result.append({
                'id': backup_id,
                'name': backup_id,
                'uploaded_at': datetime.fromtimestamp(db_file.stat().st_mtime).isoformat()
            })
    
    return sorted(result, key=lambda x: x['uploaded_at'], reverse=True)


@app.get("/api/analytics/{backup_id}")
async def get_analytics(backup_id: str):
    """Получить аналитику по бэкапу"""
    db_path = UPLOADS_DIR / f"{backup_id}.db"
    if not db_path.exists():
        raise HTTPException(404, "Backup not found")
    
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    
    analytics = Analytics(conn)
    result = analytics.get_all_analytics()
    conn.close()
    
    return result


@app.get("/api/compare/{backup_id1}/{backup_id2}")
async def compare_backups(backup_id1: str, backup_id2: str):
    """Сравнить два бэкапа"""
    import sqlite3
    
    db_path1 = UPLOADS_DIR / f"{backup_id1}.db"
    db_path2 = UPLOADS_DIR / f"{backup_id2}.db"
    
    if not db_path1.exists() or not db_path2.exists():
        raise HTTPException(404, "One or both backups not found")
    
    conn1 = sqlite3.connect(str(db_path1))
    conn2 = sqlite3.connect(str(db_path2))
    conn1.row_factory = sqlite3.Row
    conn2.row_factory = sqlite3.Row
    
    a1 = Analytics(conn1)
    a2 = Analytics(conn2)
    
    ov1 = a1.get_overview()
    ov2 = a2.get_overview()
    
    conn1.close()
    conn2.close()
    
    return {
        'backup1': {'id': backup_id1, **ov1},
        'backup2': {'id': backup_id2, **ov2},
        'diff': {
            'users': ov2['total_users'] - ov1['total_users'],
            'messages': ov2['total_messages'] - ov1['total_messages'],
            'characters': ov2['total_characters'] - ov1['total_characters'],
            'payments': ov2['total_payments'] - ov1['total_payments'],
            'revenue': ov2['total_revenue'] - ov1['total_revenue']
        }
    }


@app.delete("/api/backups/{backup_id}")
async def delete_backup(backup_id: str):
    """Удалить бэкап"""
    db_path = UPLOADS_DIR / f"{backup_id}.db"
    
    # Удаляем все файлы с этим ID
    for f in UPLOADS_DIR.glob(f"{backup_id}*"):
        f.unlink()
    
    if backup_id in BACKUPS:
        del BACKUPS[backup_id]
    
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
