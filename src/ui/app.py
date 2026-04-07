import streamlit as st
import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from src.agent.graph import create_agent_graph

st.set_page_config(page_title="Travel Agent")
st.title("Travel Package Finder")

openai_key = st.sidebar.text_input("OpenAI API Key", type="password")
tavily_key = st.sidebar.text_input("Tavily API Key", type="password")

if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

prompt = st.chat_input("Where do you want to travel?")

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    if not openai_key or not tavily_key:
        st.error("Please provide both API Keys in the sidebar.")
        st.stop()
        
    os.environ["OPENAI_API_KEY"] = openai_key
    os.environ["TAVILY_API_KEY"] = tavily_key
    
    llm = ChatOpenAI(model="gpt-4o-mini")
    app_graph = create_agent_graph(llm)
    
    with st.chat_message("assistant"):
        response_container = st.empty()
        
        inputs = {"messages": [HumanMessage(content=prompt)]}
        result = app_graph.invoke(inputs)
        
        final_answer = result["messages"][-1].content
        response_container.markdown(final_answer)
        st.session_state.messages.append({"role": "assistant", "content": final_answer})
