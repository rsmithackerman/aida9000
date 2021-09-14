# Installing:

The structure of the project allows users to run a local version of the server easily. Once you have cloned the project you will have two possible options:

## HOW TO MAKE SERVER WORK WITH PYTHON:

If you want to test a python local version of the server you have to run in a terminal (in the root directory of the project) one of the following commands depending on the OS you have:

#### Mac and linux => python -m SimpleHTTPServer
#### Windows => python -m http.server

These will execute a simple server on localhost:8000. If you want to change the port, add the port number to the command: python -m SimpleHTTPServer 7800

This simple server is a native server in python so you can run it in any python environment without installing any additional package.

### HOW TO MAKE SERVER WORK WITH NodeJs:

In this case you have to install http-server => npm install http-server -g
Then move to the root directory of the project, open a terminal and run the following command => http-server
This will run a server on localhost:8000


Once you have a http server running on the root directory of the project, navigate to localhost:port and you will have a complete version of aida9000 running on your machine.