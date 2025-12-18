#!/bin/bash

# 照片分割工具启动脚本

echo "🚀 正在启动照片分割工具..."
echo ""

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误：未找到 Python3，请先安装 Python"
    exit 1
fi

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查后端依赖是否已安装
if [ ! -d "segment-backend/venv" ] && [ -z "$(pip3 list | grep fastapi)" ]; then
    echo "📦 正在安装后端依赖..."
    cd segment-backend
    pip3 install -r requirements.txt
    cd ..
fi

# 启动后端服务（在后台运行）
echo "🔧 正在启动后端服务（端口 8000）..."
cd segment-backend
python3 main.py > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端服务
echo "🎨 正在启动前端服务（端口 3000）..."
echo ""
echo "✅ 服务启动中..."
echo "   - 后端 API: http://localhost:8000"
echo "   - 前端页面: http://localhost:3000/meme-tool"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 保存后端进程 ID，以便退出时清理
echo $BACKEND_PID > .backend.pid

# 启动前端（前台运行，这样可以看到日志）
npm run dev

# 清理：当前端退出时，停止后端
kill $BACKEND_PID 2>/dev/null
rm -f .backend.pid
exit 0

