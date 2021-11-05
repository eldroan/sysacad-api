var express = require("express");
var cors = require("cors");
var app = express();
var auth = require("basic-auth");
var rp = require("request-promise");
var cheerio = require("cheerio");
var moment = require("moment");
var iconv = require("iconv-lite");

// --------- MIDDLEWARES --------- //
app.use(cors());
//Simple middleware para asegurarnos que nos manden algo como basic auth
app.use(function (req, res, next) {
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
});

// --------- HELPERS / FUNCIONES --------- //

var errors = {
  respuestaSysacadInvalida: {
    status: 500,
    message: "El sysacad dio una respuesta invalida.",
  },
  sysacadNoResponde: {
    status: 500,
    message: "El sysacad no pudo responder.",
  },
  apiNoEncontroId: {
    status: 500,
    message: "No se se pudo recuperar el id del usuario",
  },
  apiNoEncontroExamenes: {
    status: 500,
    message: "No se se pudo recuperar los examenes",
  },
  credencialesInexistentes: {
    status: 401,
    message:
      "No se puede extraer el usuario o la contraseña de tu request o estas fueron vacias.",
  },
};

async function getCookie(req) {
  const { name: legajo, pass: password } = auth(req);

  if (legajo && password) {
    try {
      const response = await rp.post(
        "http://sysacad.frsf.utn.edu.ar/SysAcad/menuAlumno.asp",
        {
          form: {
            collection: "yes",
            legajo: legajo,
            password: password,
          },
          resolveWithFullResponse: true,
          encoding: null,
        }
      );

      if (response) {
        //Si tengo respuesta y no es vacia
        const $ = cheerio.load(response.body);
        const error = $(".textoError");
        if (error.length == 0) {
          //Login exitoso
          const cookie = response.headers["set-cookie"];
          const decoded = iconv.decode(response.body, "ISO-8859-1");
          return { cookie: cookie, body: decoded, error: false };
        } else {
          return {
            status: 401,
            message: error.text().split("�").join(""), //Borramos los � que a veces devuelve el sysacad
            error: true,
          };
        }
      } else {
        //El sysacad respondio vacio
        return { ...errors.respuestaSysacadInvalida, error: true };
      }
    } catch (e) {
      console.log(e);
      return { ...errors.sysacadNoResponde, error: true };
    }
  } else {
    return { ...errors.credencialesInexistentes, error: true };
  }
}
function getAlumno(html) {
  try {
    const $ = cheerio.load(html);
    const alumno = $(".tituloTabla").text().trim();
    const id = $("li > a")[0].attribs.href.split("?id=")[1];
    return { id, alumno, error: false };
  } catch (e) {
    return { ...errors.apiNoEncontroId, error: true };
  }
}

function parsearNumero(numero) {
  switch (numero) {
    case "Aprob.":
      return 0;
    case "uno":
      return 1;
    case "dos":
      return 2;
    case "tres":
      return 3;
    case "cuatro":
      return 4;
    case "cinco":
      return 5;
    case "seis":
      return 6;
    case "siete":
      return 7;
    case "ocho":
      return 8;
    case "nueve":
      return 9;
    case "diez":
      return 10;
    default:
      return 0;
  }
}

//https://www.frsf.utn.edu.ar/images/Calendario_Académico_Grado_2017.pdf
const finCicloLectivo2016 = moment("04/03/2017", "DD/MM/YYYY");

// PONDERACION DE CALIFICACIONES segun Ordenanza N908 - Ordenanza N1549 (27 octubre 2016)
function ponderarCalificacion(fecha, calificacion) {
  if (calificacion > 3 && finCicloLectivo2016.isAfter(fecha)) {
    //Si la nota es un aprobado y fue entregada luego del inicio del año lectivo del 2017 hay que ponderar
    return (2 / 3) * (calificacion + 5); //Segun anexo 1 de la ordenanza N1566
  } else {
    return calificacion;
  }
}
// --------- ENDPOINTS --------- //

app.get("/hello", function (req, res) {
  res.json({
    msg: "Recibo CORS!",
    auth: auth(req),
  });
});

app.get("/cookie", async function (req, res) {
  const result = await getCookie(req);
  if (result.error) {
    res.status(result.status).json({
      status: result.status,
      message: result.message, //Borramos los � que a veces devuelve el sysacad
    });
  } else {
    res.status(200).json({
      status: 200,
      message: "",
      cookie: result.cookie,
    });
  }
});

app.get("/alumno", async function (req, res) {
  const result = await getCookie(req);
  if (result.error) {
    res.status(result.status).json({
      status: result.status,
      message: result.message, //Borramos los � que a veces devuelve el sysacad
    });
  } else {
    const alumno = getAlumno(result.body);
    if (alumno.error) {
      res.status(alumno.status).json({
        status: alumno.status,
        message: alumno.message,
      });
    } else {
      res.status(200).json({
        status: 200,
        message: "",
        id: alumno.id,
        alumno: alumno.alumno,
      });
    }
  }
});

app.get("/login", async function (req, res) {
  const result = await getCookie(req);
  if (result.error) {
    res.status(result.status).json({
      status: result.status,
      message: result.message, //Borramos los � que a veces devuelve el sysacad
    });
  } else {
    //Login exitoso
    const html = result.body;
    if (html) {
      //Si tengo respuesta y no es vacia
      const $ = cheerio.load(html);
      const nombreAlumno = $(".tituloTabla").text().trim();
      const opciones = $("li > a")
        .map(function (idx, element) {
          return {
            titulo: element.firstChild.nodeValue,
            ruta: element.attribs.href,
          }; //El dia que el sysacad cambie esto va a reventar
        })
        .toArray();

      res.status(200).json({
        status: 200,
        message: "",
        response: {
          alumno: nombreAlumno,
          rutas: opciones,
        },
      });
    } else {
      //El sysacad respondio vacio
      res.status(500).json(errors.respuestaSysacadInvalida);
    }
  }
});

app.get("/examenes", async function (req, res) {
  const result = await getCookie(req);
  if (result.error) {
    res.status(result.status).json({
      status: result.status,
      message: result.message, //Borramos los � que a veces devuelve el sysacad
    });
  } else {
    const alumno = getAlumno(result.body);
    if (alumno.error) {
      res.status(alumno.status).json({
        status: alumno.status,
        message: alumno.message,
      });
    } else {
      try {
        const id = alumno.id; //https://sysacad.frsf.utn.edu.ar/SysAcad/examenes.asp?id=
        const cookie = result.cookie;
        const response = await rp.get(
          `https://sysacad.frsf.utn.edu.ar/SysAcad/examenes.asp?id=${id.toString()}`,
          {
            headers: {
              Cookie: cookie,
            },
            encoding: null,
            resolveWithFullResponse: true,
          }
        );
        const html = iconv.decode(response.body, "ISO-8859-1"); //Encoding del sysacad
        const $ = cheerio.load(html);
        const rows = $(".textoTabla");

        const examenes = [];

        //Arrancamos en 1 porque el 0 son los titulos de las tablas
        //Cortamos en el penultimo elemento porque el ultimo es el boton que dice 'Volver a menú principal' (si, en serio)
        let aprobadas = 0;
        let noAprobadas = 0;
        let sumaNotasConAplazo = 0;
        let sumaNotasSinAplazo = 0;

        for (var i = 1; i < rows.length - 1; i++) {
          const columns = rows[i].childNodes;

          const fecha = moment(columns[0].firstChild.nodeValue, "DD/MM/YYYY");
          const materia = columns[1].firstChild.nodeValue;
          const calificacion = parsearNumero(columns[2].firstChild.nodeValue);
          const calificacionPonderada = ponderarCalificacion(
            fecha,
            calificacion
          );
          const especialidad = columns[3].firstChild.nodeValue;
          const plan = columns[4].firstChild.nodeValue;
          const codigo = columns[5].firstChild.nodeValue;

          if (calificacionPonderada != 0) {
            // Las materias de ingreso se parsean como calificacion 0
            if (calificacionPonderada < 6) {
              //No aprobado
              noAprobadas++;
              sumaNotasConAplazo += calificacionPonderada;
            } else {
              //Aprobada
              aprobadas++;
              sumaNotasConAplazo += calificacionPonderada;
              sumaNotasSinAplazo += calificacionPonderada;
            }
          }

          examenes.push({
            fecha: fecha.format("DD/MM/YYYY"),
            materia,
            calificacion,
            calificacionPonderada,
            especialidad,
            plan,
            codigo,
          });
        }

        res.status(200).json({
          status: 200,
          message: "",
          response: {
            aprobadas,
            promedioConAplazo: sumaNotasConAplazo / (aprobadas + noAprobadas),
            promedioSinAplazo: sumaNotasSinAplazo / aprobadas,
            examenes: examenes,
          },
        });
      } catch (e) {
        res.status(500).json(errors.apiNoEncontroExamenes);
      }
    }
  }
});

app.get("/", function (req, res, next) {
  res.send("Aca debería haber una lista de endpoints y documentación :c");
});

app.listen(process.env.PORT || 3000, function () {
  console.log("CORS-enabled web server listening");
});
