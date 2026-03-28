from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
import json


# Define the state for the LangGraph agent
class AgentState(TypedDict):
    query: str
    document_ids: List[str]
    format_type: str
    retrieved_chunks: List[Dict[str, Any]]
    client: Any  # OpenAI client
    analyzed_query: Optional[str]
    insights: Dict[str, Any]
    citations: List[Dict[str, Any]]
    final_output: Dict[str, Any]


# Node 1: Query Analysis
def analyze_query(state: AgentState) -> dict:
    """Analyzes the user's research question to optimize for retrieval."""
    print("[Agent] Node 1: Analyzing query...")
    original_query = state["query"]
    cl = state.get("client")

    try:
        response = cl.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a search query optimizer. Rewrite the user's question to be more effective for semantic search against document chunks. Return only the optimized query text, nothing else."},
                {"role": "user", "content": original_query}
            ],
            max_tokens=200
        )
        analyzed = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[Agent] Query analysis error: {e}")
        analyzed = original_query

    print(f"[Agent] Optimized query: {analyzed}")
    return {"analyzed_query": analyzed}


# Node 2: Insight Generation
def generate_insights(state: AgentState) -> dict:
    """Generates structured insights using OpenAI based on retrieved chunks."""
    print("[Agent] Node 2: Generating insights...")
    chunks = state.get("retrieved_chunks", [])
    query = state["query"]
    format_type = state["format_type"]
    cl = state.get("client")

    # Build context from retrieved chunks
    context_parts = []
    for i, chunk in enumerate(chunks):
        context_parts.append(f"[Source: {chunk.get('source', 'Unknown')}]\n{chunk.get('text', '')}")
    context = "\n\n---\n\n".join(context_parts)

    if format_type.lower().startswith("detailed"):
        format_instruction = """Return a JSON object with these exact keys:
{
  "key_findings": [{"text": "...", "priority": "high/medium/low"}],
  "what_users_want": [{"text": "...", "priority": "high/medium/low"}],
  "strategic_quick_wins": [{"text": "...", "priority": "high/medium/low"}],
  "common_problems": [{"text": "...", "priority": "high/medium/low"}],
  "recommended_next_steps": [{"text": "...", "priority": "high/medium/low"}],
  "executive_summary": "..."
}"""
    else:
        format_instruction = """Return a JSON object with this key:
{
  "bullet_points": ["point 1", "point 2", ...]
}"""

    try:
        response = cl.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": f"""You are a research analyst AI. Generate insights ONLY from the provided document context. Do not hallucinate or make up information.

{format_instruction}

Return ONLY valid JSON, no markdown formatting or code blocks."""},
                {"role": "user", "content": f"Research Question: {query}\n\nDocument Context:\n{context}"}
            ],
            max_tokens=2000
        )
        raw = response.choices[0].message.content.strip()
        # Clean up response if it contains markdown code blocks
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        insights = json.loads(raw)
    except Exception as e:
        print(f"[Agent] Insight generation error: {e}")
        insights = {
            "key_findings": [{"text": "Error generating insights. Please try again.", "priority": "high"}],
            "executive_summary": f"Error: {str(e)}"
        }

    return {"insights": insights}


# Node 3: Citation Extraction
def extract_citations(state: AgentState) -> dict:
    """Maps insights to specific source document chunks."""
    print("[Agent] Node 3: Extracting citations...")
    chunks = state.get("retrieved_chunks", [])

    # Build unique citations from the retrieved chunks
    seen_sources = set()
    citations = []
    for chunk in chunks:
        source = chunk.get("source", "Unknown")
        if source not in seen_sources:
            seen_sources.add(source)
            citations.append({
                "id": len(citations) + 1,
                "source": source,
                "doc_id": chunk.get("doc_id", "")
            })

    return {"citations": citations}


# Node 4: Output Formatting
def format_output(state: AgentState) -> dict:
    """Formats the generated insights and citations into the final output."""
    print("[Agent] Node 4: Formatting output...")
    insights = state.get("insights", {})
    citations = state.get("citations", [])

    final_output = insights.copy()
    final_output["sources_and_citations"] = citations

    return {"final_output": final_output}


# Build the LangGraph Pipeline
def build_agent_graph() -> StateGraph:
    """Constructs the directed graph for the LangGraph agent."""
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("analyze_query", analyze_query)
    workflow.add_node("generate_insights", generate_insights)
    workflow.add_node("extract_citations", extract_citations)
    workflow.add_node("format_output", format_output)

    # Define edges (sequential flow)
    workflow.set_entry_point("analyze_query")
    workflow.add_edge("analyze_query", "generate_insights")
    workflow.add_edge("generate_insights", "extract_citations")
    workflow.add_edge("extract_citations", "format_output")
    workflow.add_edge("format_output", END)

    # Compile the graph
    app = workflow.compile()
    return app


# Singleton instance of the compiled graph
agent_app = build_agent_graph()


def run_pipeline(
    query: str,
    document_ids: List[str],
    format_type: str,
    retrieved_chunks: List[Dict[str, Any]],
    client: Any
) -> Dict[str, Any]:
    """Called by backend.py to trigger the LangGraph pipeline."""
    initial_state = {
        "query": query,
        "document_ids": document_ids,
        "format_type": format_type,
        "retrieved_chunks": retrieved_chunks,
        "client": client
    }

    # Run the graph
    result = agent_app.invoke(initial_state)

    return result.get("final_output", {})


if __name__ == "__main__":
    # Quick test (requires .env to be configured)
    from dotenv import load_dotenv
    from openai import OpenAI
    import os

    load_dotenv()
    test_client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY", "")
    )

    test_chunks = [
        {"text": "Users loved the new design but struggled to find the settings menu.", "source": "User Survey Q1 2024"},
        {"text": "73% of users indicated they prefer a one-click checkout.", "source": "Usability Testing Report"}
    ]

    test_result = run_pipeline("What do users want?", ["doc1"], "Detailed", test_chunks, test_client)
    print("\n--- Pipeline Result ---")
    print(json.dumps(test_result, indent=2))
