#!/bin/bash
echo "Deploying to Railway..."
cp -r /home/runner/workspace/artifacts/api-server/* /home/runner/workspace/vpt-server/
cd /home/runner/workspace/vpt-server
git add .
git commit -m "${1:-update}"
git push https://VantagePointTracking:$GIT_HUB_TOKEN@github.com/VantagePointTracking/Vantage_Point_Tracking.git main
echo "Done! Railway will deploy in ~60 seconds."
