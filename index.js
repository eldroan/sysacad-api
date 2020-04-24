var express = require("express");
var cors = require("cors");
var app = express();
var auth = require("basic-auth");

app.use(cors());

//Simple middleware para asegurarnos que nos manden algo como basic auth
const checkBasicAuth = function (req, res, next) {
  if (auth(req)) {
    //Viene con token de basic auth
    next();
  } else {
    //No viene con token
    res
      .status(401)
      .json({
        status: 401,
        message: "No me mandaste ningun header de basic auth :C",
      });
  }
};

app.use(checkBasicAuth);

app.get("/hello", function (req, res, next) {
  res.json({
    msg: "Recibo CORS!",
    auth: auth(req) ?? "No me mandaste ningun header de basic auth :C",
  });
});

app.listen(80, function () {
  console.log("CORS-enabled web server listening on port 80");
});
