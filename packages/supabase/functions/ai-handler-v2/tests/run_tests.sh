#!/bin/bash

echo "Running Recipe Search Tests..."
deno run --allow-net --allow-read tests/recipeSearch.test.ts

echo ""
echo "Tests completed!" 