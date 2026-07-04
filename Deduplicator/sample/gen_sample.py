import os
import random
import string
from pathlib import Path

def generate_sample(base_dir, file_count=100, total_size_mb=100):
    """
    生成示例目录结构
    base_dir: 目标目录
    file_count: 文件数量
    total_size_mb: 总计大小 (MB)
    """
    base_path = Path(base_dir)
    base_path.mkdir(parents=True, exist_ok=True)
    
    # 创建一些子目录
    subdirs = [base_path / "documents", base_path / "media", base_path / "backup"]
    for sd in subdirs:
        sd.mkdir(exist_ok=True)
        (sd / "archived").mkdir(exist_ok=True)
    (base_path / "archived").mkdir(exist_ok=True) # 修复根目录下的 archived

    # 准备一些内容块以快速生成重复文件
    unique_contents = []
    for _ in range(10):
        size = (total_size_mb * 1024 * 1024) // file_count
        unique_contents.append(''.join(random.choices(string.ascii_letters + string.digits, k=size)).encode())

    print(f"正在生成 {file_count} 个文件到 {base_dir}...")
    
    for i in range(file_count):
        # 随机选择内容（产生重复）
        content = random.choice(unique_contents)
        
        # 随机路径
        target_sd = random.choice(subdirs + [base_path])
        if random.random() > 0.5:
            target_sd = target_sd / "archived"
            
        file_name = f"file_{i}_{''.join(random.choices(string.ascii_lowercase, k=5))}.bin"
        file_path = target_sd / file_name
        
        with open(file_path, "wb") as f:
            f.write(content)

    print("示例数据生成完成。")

if __name__ == "__main__":
    generate_sample("sample_data", file_count=100, total_size_mb=50)
