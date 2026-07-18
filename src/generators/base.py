from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class GenerationResult:
    """Result from a music generation call, including provenance metadata."""

    file_path: str
    prompt: str
    duration: float
    seed: Optional[int] = None
    model: str = ""
    provider: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_provenance_dict(self) -> Dict[str, Any]:
        return {
            "output": {
                "file_path": self.file_path,
                "duration": self.duration,
                "format": self.metadata.get("format", "wav"),
            },
            "music_request": {
                "model": self.model,
                "provider": self.provider,
                "prompt": self.prompt,
                "seed": self.seed,
                **{k: v for k, v in self.metadata.items() if k != "format"},
            },
        }


class MusicGenerator(ABC):
    """Abstract interface for music generation backends."""

    @abstractmethod
    def generate_song(
        self,
        prompt: str,
        duration: float = 47.0,
        seed: Optional[int] = None,
        filename: Optional[str] = None,
        **kwargs: Any,
    ) -> Optional[GenerationResult]:
        pass
