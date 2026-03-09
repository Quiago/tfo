services:
auth
llms_manager
chat
documents
sensor_data

structure_folder:
app:
    api/v1
    core:
        config.py
        logging.py
    db
        engine.py
    models
    schemas
    services
    utils
test
    db
    api/v1
    services

.env
docker-compose.yml
Dockerfile

Database:
    -Sqlite(mvp)

Pytest for testing

uv for package management

test opc server: opc.tcp://opcuaserver.com:48010