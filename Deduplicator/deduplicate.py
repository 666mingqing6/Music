import os
import hashlib
import argparse
import logging
import json
import csv
import time
from pathlib import Path
from typing import Dict, List, Tuple
from send2trash import send2trash
import humanize

# 性能优化：分块读取大小
CHUNK_SIZE = 1024 * 1024  # 1MB

class Deduplicator:
    def __init__(self, target_dir: str, use_trash: bool = True, force: bool = False, log_level: str = "INFO"):
        self.target_dir = Path(target_dir).resolve()
        self.use_trash = use_trash
        self.force = force
        self.hashes: Dict[str, List[Path]] = {}
        self.duplicates_found: List[Tuple[str, Path, List[Path]]] = []
        self.total_size_saved = 0
        self.processed_files = 0
        self.total_files_count = 0
        
        # 配置日志
        logging.basicConfig(
            level=getattr(logging, log_level.upper()),
            format='%(asctime)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)

    def validate_input(self):
        if not self.target_dir.exists():
            raise FileNotFoundError(f"路径不存在: {self.target_dir}")
        if not self.target_dir.is_dir():
            raise NotADirectoryError(f"路径不是目录: {self.target_dir}")
        if not os.access(self.target_dir, os.R_OK):
            raise PermissionError(f"目录不可读: {self.target_dir}")

    def calculate_md5(self, file_path: Path) -> str:
        """分块计算文件的 MD5 值"""
        md5_hash = hashlib.md5()
        try:
            with open(file_path, "rb") as f:
                if file_path.stat().st_size < 1024:
                    md5_hash.update(f.read())
                else:
                    for byte_block in iter(lambda: f.read(CHUNK_SIZE), b""):
                        md5_hash.update(byte_block)
            return md5_hash.hexdigest()
        except Exception as e:
            self.logger.error(f"无法计算文件哈希 {file_path}: {e}")
            return ""

    def is_hidden(self, path: Path) -> bool:
        """检查是否为系统隐藏文件"""
        return path.name.startswith('.') or (os.name == 'nt' and self._is_windows_hidden(path))

    def _is_windows_hidden(self, path: Path) -> bool:
        import ctypes
        try:
            attrs = ctypes.windll.kernel32.GetFileAttributesW(str(path))
            return attrs != -1 and (attrs & 2)
        except:
            return False

    def scan(self):
        self.logger.info(f"正在枚举目录中的文件: {self.target_dir}")
        all_files = []
        for root, dirs, files in os.walk(self.target_dir):
            # 过滤隐藏目录
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for name in files:
                file_path = Path(root) / name
                # 跳过符号链接和隐藏文件
                if file_path.is_symlink() or self.is_hidden(file_path):
                    continue
                all_files.append(file_path)
        
        self.total_files_count = len(all_files)
        self.logger.info(f"找到 {self.total_files_count} 个待处理文件")

        start_time = time.time()
        for idx, file_path in enumerate(all_files):
            file_hash = self.calculate_md5(file_path)
            if not file_hash:
                continue
            
            if file_hash not in self.hashes:
                self.hashes[file_hash] = []
            self.hashes[file_hash].append(file_path)
            
            self.processed_files += 1
            if self.processed_files % 100 == 0:
                self.logger.info(f"进度: {self.processed_files}/{self.total_files_count}")

        elapsed = time.time() - start_time
        self.logger.info(f"扫描完成，耗时 {elapsed:.2f}s")

    def process_duplicates(self):
        for file_hash, paths in self.hashes.items():
            if len(paths) > 1:
                keep_path = paths[0]
                to_delete = paths[1:]
                self.duplicates_found.append((file_hash, keep_path, to_delete))
                
                for path in to_delete:
                    self.total_size_saved += path.stat().st_size
                    self._remove_file(path)

    def _remove_file(self, path: Path):
        try:
            if self.use_trash:
                self.logger.info(f"移动到回收站: {path}")
                send2trash(str(path))
            else:
                if self.force:
                    self.logger.info(f"永久删除: {path}")
                    path.unlink()
                else:
                    self.logger.warning(f"跳过删除 (需要 --force): {path}")
        except Exception as e:
            self.logger.error(f"删除文件失败 {path}: {e}")

    def generate_report(self, output_path: str):
        ext = Path(output_path).suffix.lower()
        report_data = []
        for file_hash, keep, deleted in self.duplicates_found:
            report_data.append({
                "hash": file_hash,
                "kept": str(keep),
                "deleted": [str(d) for d in deleted]
            })

        if ext == '.json':
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, indent=4, ensure_ascii=False)
        elif ext == '.csv':
            with open(output_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=["hash", "kept", "deleted"])
                writer.writeheader()
                for row in report_data:
                    row["deleted"] = "|".join(row["deleted"])
                    writer.writerow(row)
        
        self.logger.info(f"报告已生成: {output_path}")

    def summary(self):
        print("\n" + "="*50)
        print("去重任务总结")
        print(f"处理文件总数: {self.total_files_count}")
        print(f"发现重复组数: {len(self.duplicates_found)}")
        print(f"节省磁盘空间: {humanize.naturalsize(self.total_size_saved)}")
        print("="*50 + "\n")

def main():
    parser = argparse.ArgumentParser(description="文件去重工具 (MD5 哈希)")
    parser.add_argument("path", nargs='?', help="目标目录路径")
    parser.add_argument("--trash", action="store_true", default=True, help="移动到回收站 (默认)")
    parser.add_argument("--no-trash", dest="trash", action="store_false", help="不使用回收站")
    parser.add_argument("--force", action="store_true", help="永久删除重复文件")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="日志级别")
    parser.add_argument("--output-report", default="report.json", help="输出报告文件路径 (json 或 csv)")

    args = parser.parse_args()

    target_path = args.path
    if not target_path:
        target_path = input("请输入目标目录路径: ").strip()

    try:
        deduper = Deduplicator(
            target_path, 
            use_trash=args.trash, 
            force=args.force, 
            log_level=args.log_level
        )
        deduper.validate_input()
        deduper.scan()
        deduper.process_duplicates()
        deduper.generate_report(args.output_report)
        deduper.summary()
    except Exception as e:
        print(f"程序运行出错: {e}")

if __name__ == "__main__":
    main()
