# Yoo-Server.js
An expressjs middleware allowing the handling of multiple domains with separate pages.

## How to Use

The middleware is easy to use:

```javascript
const express = require("express");
const server = require("./Yoo-Server");
const app = express();
const port = 80;

app.use(server);

server.host("example.com")
  .get("home", ({ page, website }, req, res) => {

    // Handle the response just like normal, but with seperate pages for different domains!
    res.send("Hello world!");

  })
  .error(404, (req, res) => {

    // The error code was already sent, so no need to do res.status(404).
    res.send("This page doesn't exist!");

  });

server.host("subdomain.example.com")
  .get("home", ({ page, website }, req, res) => {
    
    // subdomain.example.com has different pages than example.com.
    res.send("This is a subdomain!");
    
  });

app.listen(port, () => {
  console.log(`Server started on port ${port}.`);
});
```

## Configuration

Yoo-Plex.js does require a separate configuration file to work. The file must be called `server.json`.  
The configuration file allows for you to add websites, pages, and more. There will soon be documentation on this.

```json
{
  "websites": [
    {
      "id": "example.com",
      "pages": [
        {
          "id": "home",
          "path": "/"
        }
      ]
    },
    {
      "id": "subdomain.example.com",
      "pages": [
        {
          "id": "home",
          "path": "/"
        }
      ]
    }
  ]
}
```
