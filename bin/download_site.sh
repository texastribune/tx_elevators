#!/usr/bin/env bash

# Instructions:
#
# run from project root directory

# Make sure the docker image is up to date
make build gunicorn
PORT=$(docker port elevators-site 8000 | cut -d : -f 2)

# give time for the servers to get up
sleep 3

mkdir -p site
cd site && wget -r localhost:$PORT --force-html -e robots=off -nH -nv --max-redirect 0
