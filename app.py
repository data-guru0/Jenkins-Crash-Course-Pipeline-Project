import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from src.agent.graph import create_agent_graph

app = Flask(__name__)
CORS(app, resources={r"/chat": {"origins": "*"}})


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"}), 200


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True)

    message = data.get("message", "").strip()
    openai_key = data.get("openai_key", "").strip()
    tavily_key = data.get("tavily_key", "").strip()

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400

    if not openai_key:
        return jsonify({"error": "OpenAI API Key is required."}), 400

    if not tavily_key:
        return jsonify({"error": "Tavily API Key is required."}), 400

    os.environ["OPENAI_API_KEY"] = openai_key
    os.environ["TAVILY_API_KEY"] = tavily_key

    try:
        llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=openai_key)
        agent_graph = create_agent_graph(llm)
        inputs = {"messages": [HumanMessage(content=message)]}
        result = agent_graph.invoke(inputs)
        final_answer = result["messages"][-1].content
        return jsonify({"response": final_answer}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
