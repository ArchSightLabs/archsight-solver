import os
import sys
# 强制将项目根目录插入搜索路径的第一位，确保 Gunicorn 能找到 backend 模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, send_from_directory, request
import logging
from logging.handlers import TimedRotatingFileHandler

from backend.config import get_backend_host, get_backend_port
from backend.api.calculate import calculate_bp
from backend.api.benchmark_submissions import benchmark_submissions_bp
from backend.api.contracts import contracts_bp
from backend.api.examples import examples_bp
from backend.api.jobs import jobs_bp
from backend.api.preview import preview_bp
from backend.api.sensitivity import sensitivity_bp
from backend.api.export import export_bp

app = Flask(__name__, 
            static_folder='frontend/dist', 
            static_url_path='/')


def is_debug_enabled() -> bool:
    return os.environ.get("FLASK_DEBUG", "1").strip().lower() in {"1", "true", "yes", "on"}


def is_reloader_enabled() -> bool:
    return os.environ.get("FLASK_RUN_RELOAD", "0").strip().lower() in {"1", "true", "yes", "on"}

# 配置专业日志系统
def setup_logging():
    log_dir = 'logs'
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # 按天轮转，保留 15 天日志
    handler = TimedRotatingFileHandler(
        os.path.join(log_dir, 'telemetry.log'),
        when='D',
        interval=1,
        backupCount=15,
        encoding='utf-8'
    )
    handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
    ))
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)

setup_logging()

@app.before_request
def log_telemetry():
    # 记录匿名客户端指纹
    client_id = request.headers.get('X-Client-ID', 'anonymous')
    if request.path.startswith('/api'):
        app.logger.info(f"User: {client_id} | Action: {request.path} | Method: {request.method}")

# 注册蓝图
app.register_blueprint(calculate_bp, url_prefix='/api')
app.register_blueprint(benchmark_submissions_bp, url_prefix='/api')
app.register_blueprint(contracts_bp, url_prefix='/api')
app.register_blueprint(examples_bp, url_prefix='/api')
app.register_blueprint(jobs_bp, url_prefix='/api')
app.register_blueprint(preview_bp, url_prefix='/api')
app.register_blueprint(sensitivity_bp, url_prefix='/api')
app.register_blueprint(export_bp, url_prefix='/api')

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,X-Client-ID')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(
        debug=is_debug_enabled(),
        host=get_backend_host(),
        port=get_backend_port(),
        use_reloader=is_reloader_enabled(),
    )
