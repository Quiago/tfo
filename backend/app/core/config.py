from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./tripolar.db"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"
    LOG_DIR: str = "logs"

    # Comma-separated list of allowed frontend origins.
    # Trailing slashes are stripped automatically.
    # Example: "http://localhost:3000,https://app.example.com"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Optional regex pattern for dynamic origins (e.g. Lightning.ai preview URLs).
    # Example: "https://\\d+-[a-z0-9]+\\.cloudspaces\\.litng\\.ai"
    ALLOW_ORIGIN_REGEX: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
