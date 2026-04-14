from flask import Flask, render_template, request, jsonify, session
import PyPDF2
import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import textwrap
import os
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", os.urandom(24))

# Configuration
UPLOAD_FOLDER = "uploaded_files"
ALLOWED_EXTENSIONS = {"pdf"}
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text:latest")
CHAT_MODEL = os.getenv("CHAT_MODEL", "qwen2.5-coder:7b")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_chat_history():
    if "chat_history" not in session:
        session["chat_history"] = []
    return session["chat_history"]


def add_to_chat_history(question, answer):
    chat_history = get_chat_history()
    chat_history.append({
        "id": str(uuid.uuid4()),
        "question": question,
        "answer": answer,
        "timestamp": datetime.now().isoformat(),
    })
    session["chat_history"] = chat_history
    session.modified = True


def get_uploaded_files():
    files = []
    if os.path.exists(UPLOAD_FOLDER):
        for filename in os.listdir(UPLOAD_FOLDER):
            if filename.endswith(".csv"):
                file_id = filename.replace(".csv", "")
                original_name = file_id + ".pdf"
                file_path = os.path.join(UPLOAD_FOLDER, filename)
                file_size = os.path.getsize(file_path)
                files.append({
                    "id": file_id,
                    "name": original_name,
                    "size": file_size,
                    "upload_date": datetime.fromtimestamp(os.path.getctime(file_path)).isoformat(),
                })
    return files


def embed_text(text):
    response = requests.post(
        f"{OLLAMA_BASE_URL}/api/embed",
        json={"model": EMBEDDING_MODEL, "input": text},
    )
    response.raise_for_status()
    return response.json()["embeddings"][0]


def extract_text_from_pdf(pdf_file):
    reader = PyPDF2.PdfReader(pdf_file)
    text = ""
    for page in reader.pages:
        text += page.extract_text()
    return text


def create_chunks(text, chunk_size=500, overlap=50):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
    return chunks


def find_top_chunks(query, dataframes, top_n=3):
    query_embedding = embed_text(query)

    all_chunks = []
    for df in dataframes:
        document_embeddings = np.stack(df["Embeddings"])
        similarities = cosine_similarity([query_embedding], document_embeddings)[0]
        for idx, (similarity, text) in enumerate(zip(similarities, df["Text"])):
            all_chunks.append({
                "text": text,
                "similarity": float(similarity),
                "source": df["Source"].iloc[idx] if "Source" in df.columns else "Unknown",
            })

    all_chunks.sort(key=lambda x: x["similarity"], reverse=True)
    return [chunk["text"] for chunk in all_chunks[:top_n]]


def make_prompt(query, relevant_passages, chat_history):
    passages = " ".join(relevant_passages)
    escaped = passages.replace("'", "").replace('"', "").replace("\n", " ")

    history_context = ""
    if chat_history:
        history_context = "Previous conversation:\n"
        for item in chat_history[-3:]:
            answer = item["answer"] if isinstance(item["answer"], str) else str(item["answer"])
            history_context += f"Q: {item['question']}\nA: {answer}\n\n"

    prompt = textwrap.dedent(f"""\
    You are a helpful and informative bot that answers questions using text from the reference passages included below.
    Be sure to respond in a complete sentence, being comprehensive, including all relevant background information.
    However, you are talking to a non-technical audience, so be sure to break down complicated concepts and
    strike a friendly and conversational tone.

    {history_context}

    If the question is not related to the document content, respond that it is outside the scope of the uploaded documents.
    If a passage is irrelevant to the answer, you may ignore it.

    CURRENT QUESTION: '{query}'
    DOCUMENT PASSAGES: '{escaped}'

    ANSWER:
    """)
    return prompt


@app.route("/")
def index():
    chat_history = get_chat_history()
    uploaded_files = get_uploaded_files()
    return render_template("index.html", chat_history=chat_history, uploaded_files=uploaded_files)


@app.route("/get_files")
def get_files():
    return jsonify({"files": get_uploaded_files()})


@app.route("/get_chat_history")
def get_chat_history_api():
    return jsonify({"history": get_chat_history()})


@app.route("/clear_chat")
def clear_chat():
    session["chat_history"] = []
    return jsonify({"message": "Chat history cleared"})


@app.route("/upload", methods=["POST"])
def upload_pdf():
    if "pdf" not in request.files:
        return jsonify({"error": "No PDF uploaded."}), 400

    file = request.files["pdf"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are allowed."}), 400

    try:
        file_id = str(uuid.uuid4())
        original_filename = secure_filename(file.filename)

        document_text = extract_text_from_pdf(file)
        chunks = create_chunks(document_text)

        df = pd.DataFrame(chunks, columns=["Text"])
        df["Title"] = [f"{original_filename} - Chunk {i+1}" for i in range(len(chunks))]
        df["Source"] = original_filename
        df["Embeddings"] = df["Text"].apply(embed_text)

        csv_filename = os.path.join(UPLOAD_FOLDER, f"{file_id}.csv")
        df.to_csv(csv_filename, index=False)

        return jsonify({
            "message": f'PDF "{original_filename}" processed successfully.',
            "file_id": file_id,
            "filename": original_filename,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


@app.route("/delete_file", methods=["DELETE"])
def delete_file():
    file_id = request.json.get("file_id")
    if not file_id:
        return jsonify({"error": "File ID required"}), 400

    try:
        csv_file = os.path.join(UPLOAD_FOLDER, f"{file_id}.csv")
        if os.path.exists(csv_file):
            os.remove(csv_file)
            return jsonify({"message": "File deleted successfully"})
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": f"Error deleting file: {str(e)}"}), 500


@app.route("/ask", methods=["POST"])
def ask_question():
    csv_files = [f for f in os.listdir(UPLOAD_FOLDER) if f.endswith(".csv")]
    if not csv_files:
        return jsonify({"error": "No documents available. Please upload PDFs first."}), 400

    dataframes = []
    try:
        for csv_file in csv_files:
            df = pd.read_csv(os.path.join(UPLOAD_FOLDER, csv_file))
            df["Embeddings"] = df["Embeddings"].apply(eval).apply(np.array)
            dataframes.append(df)
    except Exception as e:
        return jsonify({"error": f"Error loading documents: {str(e)}"}), 500

    query = request.json.get("question") if request.is_json else request.form.get("question")
    if not query:
        return jsonify({"error": "Question is required"}), 400

    try:
        chat_history = get_chat_history()
        top_passages = find_top_chunks(query, dataframes, top_n=5)
        prompt = make_prompt(query, top_passages, chat_history)

        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": CHAT_MODEL, "prompt": prompt, "stream": False},
        )
        response.raise_for_status()
        answer = response.json()["response"]

        add_to_chat_history(query, answer)
        return jsonify({"answer": answer, "chat_id": str(uuid.uuid4())})

    except Exception as e:
        return jsonify({"error": f"Error generating response: {str(e)}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
