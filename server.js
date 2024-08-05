// backend/server.js
const crypto = require("crypto"); // Usar la librería crypto de Node.js para el hashing
const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");

require("dotenv").config();
const app = express();
const port = process.env.PORT || 5001;

app.use(bodyParser.json());
app.use(cors());

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

sql.connect(dbConfig, (err) => {
  if (err) {
    console.log("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the database");
});

//Login Con Tipo
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result =
      await sql.query`SELECT * FROM Login WHERE username = ${username} AND password = ${password}`;

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      const { tipo } = user; // Obtener el campo tipo

      // Verificar el tipo de usuario y redirigir
      if (tipo === "Admin") {
        res.json({ success: true, redirect: "AsNavAdmin" });
      } else if (tipo === "User") {
        res.json({ success: true, redirect: "AsNavFor" });
      } else {
        res.json({ success: false, message: "Tipo de usuario no válido" });
      }
    } else {
      res.json({
        success: false,
        message: "Nombre de usuario o contraseña incorrectos",
      });
    }
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

//Login Central sin Tipo
app.post("/api/LoginST", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result =
      await sql.query`SELECT * FROM Login WHERE username = ${username} AND password = ${password}`;
    if (result.recordset.length > 0) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.post("/api/register", async (req, res) => {
  const {
    nombre,
    apellido,
    correoElectronico,
    fechaNacimiento,
    username,
    password,
    tipoSuscripcion, // Asegúrate de recibir este dato en el request
  } = req.body;

  let transaction;
  try {
    // Hashear la contraseña antes de guardarla
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    // Iniciar la transacción
    transaction = new sql.Transaction();
    await transaction.begin();

    const request = new sql.Request(transaction);

    // Consulta para insertar el nuevo cliente
    const insertClientQuery = `
      INSERT INTO Clientes (Nombre, Apellido, CorreoElectronico, FechaNacimiento, FechaRegistro)
      VALUES (@nombre, @apellido, @correoElectronico, @fechaNacimiento, @fechaRegistro);
      SELECT SCOPE_IDENTITY() AS ClienteID; -- Obtener el ID del cliente recién insertado
    `;

    // Definir los inputs para la consulta de inserción del cliente
    request.input("nombre", sql.NVarChar, nombre);
    request.input("apellido", sql.NVarChar, apellido);
    request.input("correoElectronico", sql.NVarChar, correoElectronico);
    request.input("fechaNacimiento", sql.Date, fechaNacimiento);
    request.input("fechaRegistro", sql.DateTime, new Date());

    // Ejecutar la consulta de inserción del cliente
    const clientResult = await request.query(insertClientQuery);
    const clienteId = clientResult.recordset[0].ClienteID; // ID del cliente recién insertado

    // Consulta para insertar el login asociado al cliente
    const insertLoginQuery = `
      INSERT INTO Login (username, password, tipo)
      VALUES (@username, @password, DEFAULT);
    `;

    // Definir los inputs para la consulta de inserción del login
    request.input("username", sql.VarChar, username);
    request.input("password", sql.VarChar, hashedPassword); // Usar la contraseña hasheada

    // Ejecutar la consulta de inserción del login
    const loginResult = await request.query(insertLoginQuery);

    // Calcular la fecha de fin de la suscripción basada en el tipo de suscripción
    const currentDate = new Date();
    const endDate = new Date(currentDate);

    let precio; // Variable para almacenar el precio de la suscripción

    // Determinar el precio y la fecha de fin basados en el tipo de suscripción
    switch (tipoSuscripcion) {
      case "Mensual Básico":
        endDate.setMonth(currentDate.getMonth() + 1);
        precio = 7.99;
        break;
      case "Mensual Estándar":
        endDate.setMonth(currentDate.getMonth() + 1);
        precio = 9.99;
        break;
      case "Mensual Premium":
        endDate.setMonth(currentDate.getMonth() + 1);
        precio = 12.99;
        break;
      case "Trimestral Básico":
        endDate.setMonth(currentDate.getMonth() + 3);
        precio = 19.99;
        break;
      case "Trimestral Estándar":
        endDate.setMonth(currentDate.getMonth() + 3);
        precio = 29.99;
        break;
      case "Trimestral Premium":
        endDate.setMonth(currentDate.getMonth() + 3);
        precio = 34.99;
        break;
      case "Anual Básico":
        endDate.setFullYear(currentDate.getFullYear() + 1);
        precio = 99.99;
        break;
      case "Anual Estándar":
        endDate.setFullYear(currentDate.getFullYear() + 1);
        precio = 109.99;
        break;
      case "Anual Premium":
        endDate.setFullYear(currentDate.getFullYear() + 1);
        precio = 119.99;
        break;
      default:
        throw new Error("Tipo de suscripción no válido.");
    }

    // Consulta para insertar la suscripción del cliente
    const insertSuscripcionQuery = `
      INSERT INTO Suscripciones (TipoSuscripcion, Precio, FechaInicio, FechaFin, ClienteID)
      VALUES (@tipoSuscripcion, @precio, @fechaInicio, @fechaFin, @clienteId);
    `;

    // Definir los inputs para la consulta de inserción de la suscripción
    request.input("tipoSuscripcion", sql.VarChar, tipoSuscripcion);
    request.input("precio", sql.Decimal(10, 2), precio); // Usar sql.Decimal para manejar precios
    request.input("fechaInicio", sql.DateTime, currentDate);
    request.input("fechaFin", sql.DateTime, endDate);
    request.input("clienteId", sql.Int, clienteId);

    // Ejecutar la consulta de inserción de la suscripción
    await request.query(insertSuscripcionQuery);

    // Confirmar la transacción si todo ha ido bien
    await transaction.commit();

    // Enviar respuesta de éxito
    res.json({ success: true, message: "Usuario registrado exitosamente" });
  } catch (err) {
    console.error("Error al registrar el usuario:", err);

    // Revertir la transacción en caso de error
    if (transaction) {
      await transaction.rollback();
    }

    // Enviar respuesta de error
    res.status(500).json({ success: false, message: "Error en el servidor" });
  }
});

app.get("/api/urls", async (req, res) => {
  try {
    const result = await sql.query(
      "SELECT UrlID, name, img, review, video, portada FROM Urls"
    );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});
//Arriba ya funciona

//Actualizar suscripcion
app.get("/api/clientes", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM Clientes");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de clientes:", err);
    res.status(500).send("Error en el servidor");
  }
});

app.get("/api/cliente/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result =
      await sql.query`SELECT * FROM Clientes WHERE ClienteID = ${id}`;
    if (result.recordset.length === 0) {
      res.status(404).json({ message: "Cliente no encontrado" });
    } else {
      res.json(result.recordset[0]);
    }
  } catch (err) {
    console.error("Error fetching client:", err);
    res.status(500).json({ message: "Error al obtener el cliente" });
  }
});

app.post("/api/actualizarSuscripcion", async (req, res) => {
  const { ClienteID, TipoSuscripcion, Precio, FechaInicio, FechaFin } =
    req.body;

  // Validar la entrada
  if (!ClienteID || !TipoSuscripcion || !Precio || !FechaInicio || !FechaFin) {
    return res
      .status(400)
      .json({ success: false, message: "Datos incompletos" });
  }

  try {
    // Suponiendo que tienes una tabla 'Suscripciones' y se actualiza por ClienteID
    const result = await sql.query`
      UPDATE Suscripciones
      SET TipoSuscripcion = ${TipoSuscripcion},
          Precio = ${Precio},
          FechaInicio = ${FechaInicio},
          FechaFin = ${FechaFin}
      WHERE ClienteID = ${ClienteID};
    `;

    // Verificar si la actualización afectó a alguna fila
    if (result.rowsAffected[0] === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Suscripción no encontrada" });
    }

    // Responder con éxito
    res.json({
      success: true,
      message: "Suscripción actualizada exitosamente",
    });
  } catch (err) {
    console.error("Error updating subscription:", err);
    res
      .status(500)
      .json({ success: false, message: "Error al actualizar la suscripción" });
  }
});

// Lista Peliculas
app.get("/api/peliculas", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM Peliculas");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de peliculas:", err);
    res.status(500).send("Error en el servidor");
  }
});

app.get("/api/suscripciones", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM Suscripciones");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de suscripciones:", err);
    res.status(500).send("Error en el servidor");
  }
});
// Main EndPoints

// Enpoint ClientesPages Start
// Endpoint para obtener todos los clientes
app.get("/api/clientes", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM Clientes");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de clientes:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Endpoint para obtener un cliente por ID
app.get("/api/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result =
      await sql.query`SELECT * FROM Clientes WHERE ClienteID = ${id}`;
    if (result.recordset.length === 0) {
      return res.status(404).send("Cliente no encontrado");
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error en la consulta de cliente por ID:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Endpoint para actualizar un cliente
app.put("/api/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre, Apellido, CorreoElectronico, FechaNacimiento } = req.body;
    await sql.query`
      UPDATE Clientes 
      SET Nombre = ${Nombre}, 
          Apellido = ${Apellido}, 
          CorreoElectronico = ${CorreoElectronico}, 
          FechaNacimiento = ${FechaNacimiento}
      WHERE ClienteID = ${id}
    `;
    res.send("Cliente actualizado");
  } catch (err) {
    console.error("Error al actualizar cliente:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Endpoint para eliminar un cliente
app.delete("/api/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await sql.query`DELETE FROM Clientes WHERE ClienteID = ${id}`;
    res.send("Cliente eliminado");
  } catch (err) {
    console.error("Error al eliminar cliente:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Endpoint para agregar Cliente
app.post("/api/clientes", async (req, res) => {
  try {
    const { Nombre, Apellido, CorreoElectronico, FechaNacimiento } = req.body;
    await sql.query`
      INSERT INTO Clientes (Nombre, Apellido, CorreoElectronico, FechaNacimiento)
      VALUES (${Nombre}, ${Apellido}, ${CorreoElectronico}, ${FechaNacimiento})
    `;
    res.send("Cliente creado");
  } catch (err) {
    console.error("Error al crear cliente:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Enpoint para Upload
// Configuración de multer para la carga de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Carpeta de destino para archivos subidos
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

// Ruta para la carga de archivos
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({
    message: "File uploaded successfully",
    filename: req.file.filename,
  });
});

// Ruta para eliminar archivos
app.delete("/api/upload/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "uploads", filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Error deleting file:", err);
      return res.status(500).json({ error: "Failed to delete file" });
    }
    res.json({ message: "File deleted successfully" });
  });
});
// Endpoint ClientsPages end

// Enpoint MoviesPage Start
// Endpoint para obtener todos los géneros
app.get("/api/generos", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM Generos");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de géneros:", err);
    res.status(500).send("Error en el servidor");
  }
});

app.get("/generos", async (req, res) => {
  try {
    const result = await sql.request().query(`
      SELECT GeneroID, Nombre FROM Generos
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("Error al obtener los géneros:", error);
    res.status(500).json({ error: "Error al obtener los géneros" });
  }
});

// Endpoint para obtener todas las URLs
app.get("/api/urls", async (req, res) => {
  try {
    const result = await sql.query("SELECT * FROM Urls");
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de URLs:", err);
    res.status(500).send("Error en el servidor");
  }
});

app.get("/urls", async (req, res) => {
  try {
    const result = await sql.request().query(`
      SELECT UrlID, name FROM Urls
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("Error al obtener las URLs:", error);
    res.status(500).json({ error: "Error al obtener las URLs" });
  }
});

// Obtener todas las películas
app.get("/api/peliculas", async (req, res) => {
  try {
    const result = await sql.query(`
      SELECT 
        p.PeliculaID,
        p.Titulo,
        p.Director,
        p.Anio,
        p.Duracion,
        p.Sinopsis,
        g.Nombre AS GeneroNombre,
        u.name AS UrlName,
        u.img AS UrlImg,
        u.review AS UrlReview,
        u.video AS UrlVideo,
        u.portada AS UrlPortada
      FROM 
        Peliculas p
      LEFT JOIN 
        Generos g ON p.GeneroID = g.GeneroID
      LEFT JOIN 
        Urls u ON p.UrlID = u.UrlID
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de películas:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Obtener una película por ID
app.get("/api/peliculas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sql.query(`
      SELECT 
        p.PeliculaID,
        p.Titulo,
        p.Director,
        p.Anio,
        p.Duracion,
        p.Sinopsis,
        g.Nombre AS GeneroNombre,
        u.name AS UrlName,
        u.img AS UrlImg,
        u.review AS UrlReview,
        u.video AS UrlVideo,
        u.portada AS UrlPortada
      FROM 
        Peliculas p
      LEFT JOIN 
        Generos g ON p.GeneroID = g.GeneroID
      LEFT JOIN 
        Urls u ON p.UrlID = u.UrlID
      WHERE 
        p.PeliculaID = ${id}
    `);
    if (result.recordset.length === 0) {
      return res.status(404).send("Película no encontrada");
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error en la consulta de película por ID:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Crear una nueva película
app.post("/api/peliculas", async (req, res) => {
  try {
    const { Titulo, Director, Anio, Duracion, Sinopsis, GeneroID, UrlID } =
      req.body;
    await sql.query`
      INSERT INTO Peliculas (Titulo, Director, Anio, Duracion, Sinopsis, GeneroID, UrlID)
      VALUES (${Titulo}, ${Director}, ${Anio}, ${Duracion}, ${Sinopsis}, ${GeneroID}, ${UrlID})
    `;
    res.send("Película creada");
  } catch (err) {
    console.error("Error al crear película:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Actualizar una película
app.put("/api/peliculas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { Titulo, Director, Anio, Duracion, Sinopsis, GeneroID, UrlID } =
      req.body;
    await sql.query`
      UPDATE Peliculas 
      SET Titulo = ${Titulo}, 
          Director = ${Director}, 
          Anio = ${Anio}, 
          Duracion = ${Duracion},
          Sinopsis = ${Sinopsis},
          GeneroID = ${GeneroID},
          UrlID = ${UrlID}
      WHERE PeliculaID = ${id}
    `;
    res.send("Película actualizada");
  } catch (err) {
    console.error("Error al actualizar película:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Eliminar una película
app.delete("/api/peliculas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await sql.query`DELETE FROM Peliculas WHERE PeliculaID = ${id}`;
    res.send("Película eliminada");
  } catch (err) {
    console.error("Error al eliminar película:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Actualizar una película
app.put("/api/peliculas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { Titulo, Director, Anio, Duracion, Sinopsis, GeneroID, UrlID } =
      req.body;

    // Verificar si la película existe
    const peliculaExistente =
      await sql.query`SELECT * FROM Peliculas WHERE PeliculaID = ${id}`;
    if (peliculaExistente.recordset.length === 0) {
      return res.status(404).send("Película no encontrada");
    }

    // Actualizar la película
    await sql.query`
      UPDATE Peliculas 
      SET Titulo = ${Titulo}, 
          Director = ${Director}, 
          Anio = ${Anio}, 
          Duracion = ${Duracion},
          Sinopsis = ${Sinopsis},
          GeneroID = ${GeneroID},
          UrlID = ${UrlID}
      WHERE PeliculaID = ${id}
    `;

    res.send("Película actualizada exitosamente");
  } catch (err) {
    console.error("Error al actualizar la película:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Obtener una película por ID con el nombre del género
app.get("/api/peliculas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sql.query`
      SELECT p.*, g.Nombre AS GeneroNombre
      FROM Peliculas p
      LEFT JOIN Generos g ON p.GeneroID = g.GeneroID
      WHERE p.PeliculaID = ${id}
    `;
    if (result.recordset.length === 0) {
      return res.status(404).send("Película no encontrada");
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error en la consulta de película por ID:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Obtener todas las películas con nombres de género y URL
app.get("/api/peliculas", async (req, res) => {
  try {
    const result = await sql.query(`
      SELECT 
        p.PeliculaID, 
        p.Titulo, 
        p.Director, 
        p.Anio, 
        p.Duracion, 
        p.Sinopsis, 
        g.Nombre AS GeneroNombre, 
        u.name AS UrlNombre
      FROM Peliculas p
      LEFT JOIN Generos g ON p.GeneroID = g.GeneroID
      LEFT JOIN Urls u ON p.UrlID = u.UrlID
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error en la consulta de películas:", err);
    res.status(500).send("Error en el servidor");
  }
});

// Endpoint MoviesPage end

//Servidor
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
