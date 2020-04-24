var express = require("express");
var cors = require("cors");
var app = express();
var auth = require("basic-auth");
var rp = require("request-promise");
var cheerio = require("cheerio");

app.use(cors());

//Simple middleware para asegurarnos que nos manden algo como basic auth
const checkBasicAuth = function (req, res, next) {
  if (auth(req)) {
    //Viene con token de basic auth
    next();
  } else {
    //No viene con token
    res.status(403).json({
      status: 403,
      message: "No me mandaste ningun header de basic auth :C",
    });
  }
};

app.use(checkBasicAuth);

//HelloWord
app.get("/hello", function (req, res, next) {
  res.json({
    msg: "Recibo CORS!",
    auth: auth(req),
  });
});

app.get("/login", async function (req, res, next) {
  const { name: legajo, pass: password } = auth(req);
  if (legajo && password) {

    try {
      const html = await rp.post(
        "https://sysacad.frsf.utn.edu.ar/SysAcad/menuAlumno.asp",
        {
          form: {
            collection: "yes",
            legajo: legajo,
            password: password,
          },
        }
      );

      if (html) {
        //Si tengo respuesta y no es vacia
        const $ = cheerio.load(html);
        const error = $(".textoError");
        if (error.length == 0) {
          //Login exitoso
          const nombreAlumno = $(".tituloTabla").text().trim();
          const opciones = $("li > a")
            .map(function (idx, element) {
              return {
                titulo: element.firstChild.nodeValue,
                ruta: element.attribs.href,
              }; //El dia que el sysacad cambie esto va a reventar
            })
            .toArray();

          //TODO: Guardarse la cookie y extraer toda esa funcionalidad para reusarla en los demas endpoints
          res.status(200).json({
            status: 200,
            message: "Ok",
            response: {
              alumno: nombreAlumno,
              rutas: opciones,
            },
          });
        } else {
          console.log(error);
          res.status(401).json({
            status: 401,
            message: error.text().split("�").join(""), //Borramos los � que a veces devuelve el sysacad
          });
        }
      } else {
        //El sysacad respondio vacio
        res.status(500).json({
          status: 500,
          message: "El sysacad dio una respuesta invalida.",
        });
      }
    } catch (e) {
      console.log(e);
      res.status(500).json({
        status: 500,
        message: "El sysacad no pudo responder.",
      });
    }
  } else {
    res.status(401).json({
      status: 401,
      message:
        "No se puede extraer el usuario o la contraseña de tu request o estas fueron vacias.",
    });
  }
});

app.listen(process.env.PORT || 3000, function () {
  console.log("CORS-enabled web server listening");
});
