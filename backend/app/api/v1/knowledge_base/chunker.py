"""
knowledge_base/chunker.py — Fragmentación de texto en chunks para RAG.

Algoritmo:
  1. Split por párrafos (doble newline).
  2. Fusionar párrafos consecutivos hasta alcanzar chunk_size caracteres.
  3. El overlap copia los últimos `overlap` caracteres del chunk anterior
     al inicio del siguiente — preserva contexto entre fragmentos.
"""


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """
    Divide text en chunks de máximo chunk_size caracteres con overlap.
    Devuelve lista de strings. Descarta chunks vacíos o muy cortos (< 20 chars).
    """
    text = text.replace("\r\n", "\n")
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    chunks = []
    current = ""
    carry = ""

    for para in paragraphs:
        candidate = (carry + " " + para).strip() if carry else para

        if len(current) + len(candidate) + 1 <= chunk_size:
            current = (current + " " + candidate).strip() if current else candidate
        else:
            if current and len(current) >= 20:
                chunks.append(current)
                carry = current[-overlap:] if len(current) > overlap else current
            current = (carry + " " + candidate).strip() if carry else candidate

            if len(current) > chunk_size:
                words = current.split(" ")
                sub = ""
                for word in words:
                    trial = (sub + " " + word).strip() if sub else word
                    if len(trial) <= chunk_size:
                        sub = trial
                    else:
                        if sub and len(sub) >= 20:
                            chunks.append(sub)
                        carry = sub[-overlap:] if len(sub) > overlap else sub
                        sub = (carry + " " + word).strip() if carry else word
                current = sub

    if current and len(current) >= 20:
        chunks.append(current)

    return chunks
