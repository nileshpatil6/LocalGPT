<div align="center">

# LocalGPT

### Chat with your PDFs — fully local, no API keys, no data leaves your machine

*Upload a PDF. Ask questions. Get answers powered by a local LLM running on your own hardware.*

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-2.3-lightgrey.svg)](https://flask.palletsprojects.com)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-black.svg)](https://ollama.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## How It Works

```
Your PDF
    │
    ▼
Text extraction (PyPDF2)
    │
    ▼
Chunked into 500-word segments
    │
    ▼
Embedded with nomic-embed-text (via Ollama, runs locally)
    │
    ▼
Stored as embeddings on disk
    │
Your Question ──► embed question ──► cosine similarity ──► top 5 chunks
                                                                │
                                                                ▼
                                                     qwen2.5-coder:7b (local)
                                                     answers from those chunks
```

Everything runs on your machine. No OpenAI. No Gemini. No data sent anywhere.

---

## Prerequisites

- Python 3.9+
- [Ollama](https://ollama.com) installed and running

Pull the required models once:

```bash
ollama pull nomic-embed-text
ollama pull qwen2.5-coder:7b
```

> **Note:** `qwen2.5-coder:7b` is ~4.7 GB. Any other Ollama model works — just update `CHAT_MODEL` in `.env`.

---

## Quickstart

```bash
git clone https://github.com/nileshpatil6/LocalGPT.git
cd LocalGPT

# Create virtual environment
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
# .venv\Scripts\activate       # Windows PowerShell

# Install dependencies
pip install -r requirements.txt

# Configure (optional — defaults work out of the box)
cp .env.example .env

# Run
python app.py
```

Open **http://localhost:5000** in your browser.

---

## Configuration

Copy `.env.example` to `.env` and edit as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | random | Flask session secret — set a fixed value to persist sessions across restarts |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `EMBEDDING_MODEL` | `nomic-embed-text:latest` | Model used to embed text chunks |
| `CHAT_MODEL` | `qwen2.5-coder:7b` | Model used to generate answers |
| `PORT` | `5000` | Port for the Flask server |

---

## Features

- Upload multiple PDFs — all are searched simultaneously
- Cosine similarity retrieval across all uploaded documents
- Conversation history — last 3 exchanges included in every prompt
- Delete documents individually
- Fully responsive UI (mobile-friendly)
- 100% local — embeddings and answers never leave your machine

---

## Project Structure

```
LocalGPT/
├── app.py              # Flask app — routes, RAG logic, Ollama calls
├── requirements.txt
├── .env.example
├── static/
│   ├── script.js       # Frontend logic (upload, chat, file list)
│   └── style.css       # Responsive styles
└── templates/
    └── index.html      # Two-panel layout: sidebar + chat
```

---

## Swapping the LLM

Any model available in Ollama works. Pull it first, then set `CHAT_MODEL` in `.env`:

```bash
ollama pull llama3.2
# then in .env:
# CHAT_MODEL=llama3.2
```

---

## License

[MIT](LICENSE) © 2026 [nileshpatil6](https://github.com/nileshpatil6)
