#!/bin/bash

echo "🔧 AWS CDK Bootstrap Helper"
echo "==========================="
echo ""

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &>/dev/null; then
    echo "❌ AWS credentials not found!"
    echo ""
    echo "Please configure AWS credentials first:"
    echo "  aws configure"
    echo ""
    echo "Or if using SSO:"
    echo "  aws sso login --profile <profile-name>"
    echo "  export AWS_PROFILE=<profile-name>"
    echo ""
    exit 1
fi

echo "✅ AWS credentials found"
echo ""

# Get account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo $AWS_REGION || echo "eu-central-1")

echo "📋 Current AWS Configuration:"
echo "  Account ID: $ACCOUNT_ID"
echo "  Region: $REGION"
echo ""

# Check if using SSO
if [ ! -z "$AWS_PROFILE" ]; then
    echo "  Profile: $AWS_PROFILE"
    echo ""
fi

echo "🚀 Bootstrapping CDK for region: $REGION"
echo ""
echo "This will create CDK resources in your AWS account."
echo "You need admin permissions to run this."
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Bootstrap cancelled"
    exit 1
fi

echo ""
echo "📦 Running CDK bootstrap..."
echo ""

# Bootstrap the region
npx cdk bootstrap aws://$ACCOUNT_ID/$REGION

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Bootstrap successful!"
    echo ""
    echo "Now you can run:"
    echo "  npx ampx sandbox"
    echo ""
else
    echo ""
    echo "❌ Bootstrap failed!"
    echo ""
    echo "Common issues:"
    echo "  1. Insufficient permissions (need admin access)"
    echo "  2. AWS SSO session expired (run: aws sso login --profile <profile>)"
    echo "  3. Wrong region selected"
    echo ""
    echo "Try using a different region:"
    echo "  AWS_REGION=us-east-1 ./bootstrap-aws.sh"
    echo ""
fi
