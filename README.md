# Sales Demo Frontend

A React-based chat application that demonstrates AI-powered document search and conversation capabilities using AWS Bedrock AgentCore integration.

## Overview

This frontend application provides an interactive chat interface for users to query and explore documentation through an AI-powered RAG (Retrieval-Augmented Generation) system. The application connects to AWS Bedrock AgentCore to deliver intelligent responses with source citations and structured data.

## Features

- **Interactive Chat Interface**: Real-time conversation with AI assistant
- **Authentication**: AWS Cognito-powered user authentication
- **Topic Selection (not available currently)**: Filtered queries by categories (Getting Started, API Reference, Best Practices)
- **Streaming Responses**: Real-time message streaming for better user experience
- **Thinking Process Visibility**: Shows AI reasoning process (collapsible thinking sections)
- **Source Citations (not available currently)**: Displays source documents and references for answers
- **Search Trace (not available currently)**: Detailed information about retrieval attempts and methodology
- **Responsive Design**: Modern React UI with Amplify UI components

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Authentication**: AWS Amplify Auth with Cognito
- **UI Components**: AWS Amplify UI React
- **Backend Integration**: AWS Bedrock AgentCore
- **Deployment**: AWS Amplify

## Architecture

The application follows this flow:

1. **User Authentication**: Users authenticate through AWS Cognito
2. **Chat Interface**: Users send messages through the React chat interface
3. **AgentCore Integration**: Frontend calls AWS Bedrock AgentCore runtime endpoint
4. **AI Processing**: AgentCore processes queries using the deployed RAG agent
5. **Response Streaming**: Results stream back with structured data and sources
6. **UI Updates**: Interface updates in real-time with thinking process and final answers

## Backend Repository

This frontend connects to the RAG agent deployed via the backend repository:
**[strands-demo-backend](https://github.com/roblonczek-auvaria/strands-demo-backend)**

The backend repository contains:
- RAG agent implementation using Strands Agents framework
- Deployment scripts for AWS Bedrock AgentCore
- Knowledge base setup and configuration
- Docker containerization for agent deployment

## Configuration

The application requires these environment variables:

```env
VITE_AGENT_RUNTIME_ARN=arn:aws:bedrock-agentcore:region:account:runtime/agent-name
VITE_BEDROCK_REGION=eu-central-1
```

## Key Components

### `App.tsx`
- Main chat interface with message history
- Handles streaming responses and thinking process
- Manages authentication state

### `api.ts`
- Bedrock AgentCore integration
- Handles streaming chat requests
- Processes structured responses with sources and metadata

### `TopicSelect.tsx`
- Topic filtering component
- Allows users to focus queries on specific documentation areas

### Amplify Configuration
- **Authentication**: Email-based login with Cognito
- **Backend**: Defined in `amplify/backend.ts`
- **Auth Resource**: Configured in `amplify/auth/resource.ts`

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   - Set up `.env` file with required AgentCore ARN
   - Ensure AWS credentials are configured

3. **Deploy Amplify Backend**:
   ```bash
   npx ampx sandbox
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

5. **Build for Production**:
   ```bash
   npm run build
   ```

## Integration Details

### AgentCore Connection
- Uses AWS Bedrock AgentCore runtime API
- Authenticates with Cognito access tokens
- Supports both streaming and non-streaming responses
- Includes session management for conversation continuity

### Response Structure
- **Structured Data**: Includes answer, sources, search trace
- **Thinking Process**: Shows AI reasoning (collapsible)
- **Source Citations**: Links to original documents
- **Methodology**: Explains search and retrieval approach

## Development

The application is built with modern React patterns:
- Functional components with hooks
- TypeScript for type safety
- Real-time streaming with fetch API
- Responsive design principles

For backend development and agent deployment, refer to the [strands-demo-backend repository](https://github.com/roblonczek-auvaria/strands-demo-backend).