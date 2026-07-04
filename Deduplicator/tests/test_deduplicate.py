import pytest
import os
import shutil
import tempfile
from pathlib import Path
from deduplicate import Deduplicator

@pytest.fixture
def temp_dir():
    """创建一个临时测试目录"""
    d = tempfile.mkdtemp()
    yield Path(d)
    shutil.rmtree(d)

def create_file(path, content):
    with open(path, "wb") as f:
        f.write(content)

def test_empty_dir(temp_dir):
    deduper = Deduplicator(str(temp_dir), use_trash=False, force=True)
    deduper.scan()
    deduper.process_duplicates()
    assert deduper.total_files_count == 0
    assert len(deduper.duplicates_found) == 0

def test_no_duplicates(temp_dir):
    create_file(temp_dir / "f1.txt", b"content1")
    create_file(temp_dir / "f2.txt", b"content2")
    deduper = Deduplicator(str(temp_dir), use_trash=False, force=True)
    deduper.scan()
    deduper.process_duplicates()
    assert deduper.total_files_count == 2
    assert len(deduper.duplicates_found) == 0

def test_basic_deduplication(temp_dir):
    # 创建三个相同的文件
    content = b"duplicate content"
    create_file(temp_dir / "f1.txt", content)
    create_file(temp_dir / "f2.txt", content)
    create_file(temp_dir / "f3.txt", content)
    
    deduper = Deduplicator(str(temp_dir), use_trash=False, force=True)
    deduper.scan()
    deduper.process_duplicates()
    
    assert deduper.total_files_count == 3
    assert len(deduper.duplicates_found) == 1
    # 应该只剩下一个文件
    remaining_files = list(temp_dir.glob("*"))
    assert len(remaining_files) == 1

def test_recursive_deduplication(temp_dir):
    sub = temp_dir / "sub"
    sub.mkdir()
    content = b"hello"
    create_file(temp_dir / "f1.txt", content)
    create_file(sub / "f2.txt", content)
    
    deduper = Deduplicator(str(temp_dir), use_trash=False, force=True)
    deduper.scan()
    deduper.process_duplicates()
    
    assert len(deduper.duplicates_found) == 1
    assert len(list(temp_dir.rglob("*"))) == 2 # 1个文件 + 1个子目录

def test_unicode_paths(temp_dir):
    name = "音乐_music_🎵.txt"
    content = b"unicode"
    create_file(temp_dir / name, content)
    create_file(temp_dir / f"copy_{name}", content)
    
    deduper = Deduplicator(str(temp_dir), use_trash=False, force=True)
    deduper.scan()
    deduper.process_duplicates()
    assert len(deduper.duplicates_found) == 1

def test_small_large_mixed(temp_dir):
    # 小文件 (<1KB)
    create_file(temp_dir / "small1.txt", b"s" * 100)
    create_file(temp_dir / "small2.txt", b"s" * 100)
    # 大文件 (>1MB)
    large_content = b"L" * (2 * 1024 * 1024)
    create_file(temp_dir / "large1.bin", large_content)
    create_file(temp_dir / "large2.bin", large_content)
    
    deduper = Deduplicator(str(temp_dir), use_trash=False, force=True)
    deduper.scan()
    deduper.process_duplicates()
    assert len(deduper.duplicates_found) == 2
    assert deduper.total_size_saved == 100 + (2 * 1024 * 1024)
