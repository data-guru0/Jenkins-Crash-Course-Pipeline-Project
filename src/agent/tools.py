from langchain_community.tools.tavily_search import TavilySearchResults

def get_tools():
    tavily_tool = TavilySearchResults(max_results=5)
    return [tavily_tool]
