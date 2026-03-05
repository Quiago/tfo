"""
core/logging.py — Configuración de logging estructurado para toda la aplicación.

Dos destinos, dos propósitos:

  CONSOLA (StreamHandler)
    Nivel:   LOG_LEVEL del .env (por defecto INFO).
    Formato: texto legible con colores implícitos por el terminal.
    Para qué: ver operaciones normales mientras desarrollas.

  ARCHIVO (FileHandler, uno por arranque del servidor)
    Nivel:   DEBUG siempre — captura absolutamente todo.
    Formato: texto detallado con campos extra y tracebacks completos.
    Para qué: análisis post-mortem de bugs, errores intermitentes,
              lentitudes — todo lo que se pierde en la terminal.
    Archivo: logs/tripolar_YYYYMMDD_HHMMSS.log

Patrón de uso en cualquier módulo:
  import logging
  logger = logging.getLogger(__name__)

  logger.info("connector_created", extra={"connector_id": "ua-1"})

  try:
      ...
  except Exception:
      logger.warning("discovery_error", extra={"connector_id": cid}, exc_info=True)
      raise

Loggers externos silenciados (muy verbosos):
  asyncua, httpx, httpcore, transformers, huggingface_hub
"""

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings

_CONSOLE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_FILE_FORMAT = _CONSOLE_FORMAT
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
_NOISY_LOGGERS = ("asyncua", "httpx", "httpcore", "transformers", "huggingface_hub", "sentence_transformers", "torch")


class _DetailedFileFormatter(logging.Formatter):
    """
    Formatter para el archivo de log con dos añadidos respecto al estándar:

    1. Campos extra: si el caller pasó extra={"key": value, ...}, los agrega
       como «  key=value» al final de la línea de log.

    2. Tracebacks: si se pasó exc_info=True (o si ocurrió una excepción),
       incluye el traceback completo en las líneas siguientes.
    """

    _BUILTIN_KEYS = frozenset({
        "msecs", "created", "funcName", "module", "args", "asctime",
        "filename", "msg", "message", "levelno", "levelname", "exc_text",
        "process", "processName", "relativeCreated", "name", "threadName",
        "exc_info", "lineno", "pathname", "stack_info", "taskName", "thread",
    })

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = [f"{k}={v}" for k, v in record.__dict__.items() if k not in self._BUILTIN_KEYS]
        extra_str = "  " + "  ".join(extras) if extras else ""
        first_line, *rest = base.split("\n", 1)
        return first_line + extra_str + ("\n" + rest[0] if rest else "")


def setup_logging() -> None:
    """
    Configura el sistema de logging.
    Llamar UNA VEZ al inicio del servidor (lifespan en main.py).
    """
    console_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(console_level)
    console_handler.setFormatter(logging.Formatter(_CONSOLE_FORMAT, datefmt=_DATE_FORMAT))

    file_handler = None
    log_dir = Path(settings.LOG_DIR)
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"tripolar_{timestamp}.log"
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(_DetailedFileFormatter(_FILE_FORMAT, datefmt=_DATE_FORMAT))
    except OSError as e:
        print(f"[logging] WARNING: no se pudo crear el archivo de log: {e}", file=sys.stderr)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(console_handler)
    if file_handler:
        root.addHandler(file_handler)
    root.setLevel(logging.DEBUG)

    for noisy in _NOISY_LOGGERS:
        logging.getLogger(noisy).setLevel(logging.WARNING)

    startup_logger = logging.getLogger("tripolar.startup")
    startup_logger.info(
        "server_startup",
        extra={
            "log_file": str(file_handler.baseFilename) if file_handler else "none",
            "console_level": console_level,
            "log_format": settings.LOG_FORMAT,
        },
    )
