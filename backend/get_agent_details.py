"""
Get AgentCore agent details including invoke endpoint.

Usage:
    python get_agent_details.py
"""

import boto3
import json

AGENT_RUNTIME_ARN = 'arn:aws:bedrock-agentcore:eu-central-1:081302066317:runtime/demo_rag_agent-CYaQGc8qoH'
REGION = 'eu-central-1'

def get_agent_details():
    """Get detailed information about the deployed agent."""
    
    # Extract agent runtime ID from ARN
    # ARN format: arn:aws:bedrock-agentcore:region:account:runtime/agent-id
    agent_runtime_id = AGENT_RUNTIME_ARN.split('/')[-1]
    
    print("="*70)
    print("Getting Agent Details")
    print("="*70)
    print(f"\nAgent ARN: {AGENT_RUNTIME_ARN}")
    print(f"Agent Runtime ID: {agent_runtime_id}")
    print(f"Region: {REGION}\n")
    
    client = boto3.client('bedrock-agentcore-control', region_name=REGION)
    
    try:
        response = client.get_agent_runtime(
            agentRuntimeId=agent_runtime_id
        )
        
        print("✓ Agent Details Retrieved")
        print("="*70)
        
        # Print full response
        print("\nFull Response:")
        print(json.dumps(response, indent=2, default=str))
        
        # Extract key information
        print("\n" + "="*70)
        print("Key Information:")
        print("="*70)
        print(f"Name: {response.get('agentRuntimeName', 'N/A')}")
        print(f"ARN: {response.get('agentRuntimeArn', 'N/A')}")
        print(f"Status: {response.get('status', 'N/A')}")
        
        # Look for endpoint information
        if 'endpointUrl' in response:
            print(f"\n✓ Invoke Endpoint: {response['endpointUrl']}")
        elif 'invokeUrl' in response:
            print(f"\n✓ Invoke URL: {response['invokeUrl']}")
        else:
            print("\n⚠️  No explicit endpoint URL in response")
            print("    You may need to construct it manually or check AWS documentation")
        
        # Check for network configuration
        if 'networkConfiguration' in response:
            print(f"\nNetwork Mode: {response['networkConfiguration'].get('networkMode', 'N/A')}")
        
        # Check for auth configuration
        if 'authorizerConfiguration' in response:
            auth_config = response['authorizerConfiguration']
            print(f"\nAuthentication: Configured")
            if 'customJWTAuthorizer' in auth_config:
                print(f"  Type: Custom JWT")
                print(f"  Discovery URL: {auth_config['customJWTAuthorizer'].get('discoveryUrl', 'N/A')}")
        
        return response
        
    except Exception as e:
        print(f"\n✗ Error getting agent details: {e}")
        raise


if __name__ == "__main__":
    try:
        get_agent_details()
    except Exception as e:
        print(f"\n✗ Failed: {e}")
        exit(1)
