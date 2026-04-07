from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from src.agent.state import AgentState
from src.agent.tools import get_tools
from langgraph.prebuilt import ToolNode

def create_agent_graph(llm: ChatOpenAI):
    tools = get_tools()
    llm_with_tools = llm.bind_tools(tools)
    
    system_prompt = SystemMessage(
        content="You are a strict Travel Itinerary Assistant. "
                "You must ONLY answer questions related to travel, destinations, itineraries, and packages. "
                "Use the Tavily search tool to find real travel packages, prices, companies, and provide direct apply/booking links. "
                "Refuse to answer any queries unrelated to travel."
    )
    
    def call_model(state: AgentState):
        messages = [system_prompt] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}
        
    def should_continue(state: AgentState):
        messages = state["messages"]
        last_message = messages[-1]
        
        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            return "end"
        else:
            return "continue"
            
    workflow = StateGraph(AgentState)
    
    tool_node = ToolNode(tools)
    
    workflow.add_node("agent", call_model)
    workflow.add_node("action", tool_node)
    
    workflow.set_entry_point("agent")
    
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "continue": "action",
            "end": END,
        }
    )
    
    workflow.add_edge("action", "agent")
    
    return workflow.compile()
