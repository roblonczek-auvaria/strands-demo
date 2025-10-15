"""
Test invocation script for deployed AgentCore agent with JWT authentication.

This script uses HTTPS requests (not AWS SDK) to invoke your agent with JWT tokens.

Usage:
    python test_invocation.py

Requirements:
    pip install requests
"""

import requests
import json
import time
from datetime import datetime
import sys
from typing import Any, Dict

# Ensure stdout can handle Unicode characters returned by the agent
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

# ============================================================================
# CONFIGURATION
# ============================================================================

AGENT_RUNTIME_ARN = 'arn:aws:bedrock-agentcore:eu-central-1:081302066317:runtime/demo_rag_agent-CYaQGc8qoH'  # Get this from deploy_agent.py output
REGION = 'eu-central-1'

# JWT Token from Cognito (get this from your frontend login or AWS Cognito)
# This should be the ID token (idToken) from Cognito authentication
JWT_TOKEN = 'eyJraWQiOiJHbzVwMW01RU1LQnh2bW4reVpESUNTeVBzSUNFR3Z0RmFpem9ORGRHWjU0PSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJmMzk0NTgxMi0wMGIxLTcwZDktZDRmNC0zMTE5ODUyN2IwMmYiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmV1LWNlbnRyYWwtMS5hbWF6b25hd3MuY29tXC9ldS1jZW50cmFsLTFfT0drYjdIYlJ2IiwiY29nbml0bzp1c2VybmFtZSI6ImYzOTQ1ODEyLTAwYjEtNzBkOS1kNGY0LTMxMTk4NTI3YjAyZiIsIm9yaWdpbl9qdGkiOiJjNmYxZjQ0NS1jMWQ0LTQxMjUtOTEzZC0xYzFmZTAzZTY2M2QiLCJhdWQiOiIyYjEwdjl2bzdsdTYzdXNjNTlnNTNydWFvbCIsImV2ZW50X2lkIjoiZTZkM…iOjE3NjAwMDQ0NTAsImV4cCI6MTc2MDAwODA1MCwiaWF0IjoxNzYwMDA0NDUwLCJqdGkiOiIxZGQ0ZjhkYy02MjkzLTQ0NDEtOWI1Ny0zNzFhYTJiMTg0NGUiLCJlbWFpbCI6InIub2Jsb25jemVrQGF1dmFyaWEuY29tIn0.c1Z4B_7kj74GYK1kJtJgWyQotiFUd94jEDGIbZ8ZXowJ9CIE_4D_LP2xAhDS4ChtO7_mOVb7JPZDbkNhpjYQN2klWPaUpI9ztxnDx1jGZztCkFYU_SkNOpwe1OYFoqRrHJczwJq3VceBhsDu31tjbvOvRVn-Yjh4rQ5dBKFgm-frKnOC06zoGHsmPtRWgO0m3jRH_N70eppVMu25GWNdxBSX2RJBn-DgR79rmnyn3hAr27VSUk3_LYCbVsyCcwhyHT_p1zcWUKcm_1GzQ94NCMVMUMuFCOHCvAfkNfkajXo5--B36-kifSZCelwSHf4RXef9OYUxF8c7n_nUGkTIhw'

# Test prompt
TEST_PROMPT = 'whats atp'

# Optional filters
TOPIC_FILTER = None  # e.g., 'IMPOZITE, TAXE, CONTRIBUTII'
ACTIVE_ONLY = False

# ============================================================================
# Invocation using HTTPS (Required for JWT Auth)
# ============================================================================

def invoke_agent_with_jwt():
    """Invoke the agent using HTTPS with JWT Bearer token.
    
    Note: AWS SDK doesn't support JWT auth for AgentCore, must use HTTPS directly.
    """
    
    import urllib.parse
    
    print("="*70)
    print("Testing AgentCore Agent Invocation with JWT Auth (HTTPS)")
    print("="*70)
    print(f"\nAgent ARN: {AGENT_RUNTIME_ARN}")
    print(f"Region: {REGION}")
    print(f"Prompt: {TEST_PROMPT}")
    if TOPIC_FILTER:
        print(f"Topic Filter: {TOPIC_FILTER}")
    if ACTIVE_ONLY:
        print(f"Active Only: True")
    print(f"\nJWT Token: {JWT_TOKEN[:50]}..." if len(JWT_TOKEN) > 50 else f"\nJWT Token: {JWT_TOKEN}")
    
    # Generate session ID (must be 33+ characters)
    session_id = f"test_session_{int(time.time())}_{datetime.now().microsecond}_extra"
    print(f"Session ID: {session_id} (length: {len(session_id)})")
    
    # URL encode the agent ARN (as per AWS documentation)
    escaped_agent_arn = urllib.parse.quote(AGENT_RUNTIME_ARN, safe='')
    
    # Construct the URL according to AWS AgentCore documentation
    # Format: https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{escaped_arn}/invocations?qualifier=DEFAULT
    endpoint = f"https://bedrock-agentcore.{REGION}.amazonaws.com/runtimes/{escaped_agent_arn}/invocations?qualifier=DEFAULT"
    
    print(f"\nEndpoint: {endpoint}")
    
    # Prepare headers with JWT Bearer token
    headers = {
        'Authorization': f'Bearer {JWT_TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': session_id
    }
    
    # Prepare payload
    payload: Dict[str, Any] = {
        "prompt": TEST_PROMPT
    }
    
    # Add filters if provided
    if TOPIC_FILTER or ACTIVE_ONLY:
        payload["input"] = {}
        if TOPIC_FILTER:
            payload["input"]["topic"] = TOPIC_FILTER
        if ACTIVE_ONLY:
            payload["input"]["active_only"] = True
    
    print("\n" + "-"*70)
    print("Sending HTTPS POST request...")
    print("-"*70 + "\n")
    
    try:
        # Make HTTPS POST request (using data=json.dumps() as per AWS docs)
        response = requests.post(
            endpoint,
            headers=headers,
            data=json.dumps(payload),
            timeout=300  # 5 minute timeout for agent processing
        )
        
        # Check response status
        response.raise_for_status()
        
        # Parse response
        response_data = response.json()
        
        print("✓ Agent Response Received")
        print(f"Status Code: {response.status_code}")
        print("="*70)
        
        # Pretty print the response
        if 'output' in response_data:
            output = response_data['output']
            if 'message' in output:
                message = output['message']
                if isinstance(message, dict):
                    # Handle structured response
                    if 'answer' in message:
                        print(f"\n📝 Answer:\n{message['answer']}")
                    if 'sources' in message and message['sources']:
                        print(f"\n📚 Sources:")
                        for i, source in enumerate(message['sources'], 1):
                            print(f"  {i}. {source.get('articolul', 'N/A')}")
                            print(f"     File ID: {source.get('file_id', 'N/A')}")
                    if 'raw' in message:
                        print(f"\n🔍 Raw Response Preview:")
                        raw = message['raw']
                        print(raw[:500] + "..." if len(raw) > 500 else raw)
                else:
                    print(f"\n{message}")
        elif 'response' in response_data:
            # Handle simple response format
            print(f"\n{response_data['response']}")
        else:
            print("\n" + json.dumps(response_data, indent=2, ensure_ascii=False))
        
        print("\n" + "="*70)
        print("✓ Test completed successfully!")
        print("="*70)
        
        return response_data
        
    except requests.exceptions.HTTPError as e:
        print(f"\n✗ HTTP Error: {e}")
        print(f"Status Code: {e.response.status_code}")
        print(f"Response: {e.response.text}")
        print("\nTroubleshooting:")
        print("1. Verify your JWT token is valid (not expired)")
        print("2. Ensure the token is from the correct Cognito User Pool")
        print("3. Check that the agent ARN is correct")
        print("4. Verify the token's client_id matches the allowed clients in agent config")
        raise
    except requests.exceptions.RequestException as e:
        print(f"\n✗ Request Error: {e}")
        raise
    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise


if __name__ == "__main__":
    # Validate configuration
    if AGENT_RUNTIME_ARN == 'YOUR_AGENT_ARN_HERE':
        print("✗ Error: Please update AGENT_RUNTIME_ARN with your actual agent ARN")
        print("\nRun this to get your agent ARN:")
        print("  python agentcore_deploy.py --action list --region eu-central-1")
        exit(1)
    
    if JWT_TOKEN == 'YOUR_JWT_TOKEN_HERE':
        print("✗ Error: Please update JWT_TOKEN with your Cognito JWT token")
        print("\nHow to get a JWT token:")
        print("1. Log in through your Amplify frontend")
        print("2. Extract the idToken from the authentication response")
        print("3. Or use AWS CLI: aws cognito-idp admin-initiate-auth ...")
        exit(1)
    
    try:
        invoke_agent_with_jwt()
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        exit(1)
