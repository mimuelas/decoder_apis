# HAR Analyzer

Esta es una aplicación web construida con Flask que permite a los usuarios subir archivos HAR (HTTP Archive), filtrarlos según varios criterios y visualizar los resultados de una manera organizada.

## Características

- **Subida de archivos HAR**: Carga fácilmente tus archivos HAR a través de una interfaz web.
- **Filtrado avanzado**: Filtra las peticiones por:
    - Dominio
    - Método HTTP (GET, POST, etc.)
    - Tipo de contenido (MIME type)
    - Código de estado (errores o no errores)
    - Texto contenido en la URL
    - Texto contenido en el cuerpo de la respuesta (soporta texto plano y expresiones regulares)
- **Agrupación de resultados**: Agrupa las peticiones por método, tipo de contenido, código de estado o dominio para un análisis más claro.
- **Visualización detallada**: Explora los detalles de cada petición, incluyendo headers, cuerpo de la respuesta y un comando cURL generado automáticamente.
- **Descarga de resultados**: Descarga los datos filtrados como un nuevo archivo HAR.

## Cómo ejecutar el proyecto

Sigue estos pasos para poner en marcha la aplicación en tu entorno local.

### Prerrequisitos

- Tener [Python 3.6+](https://www.python.org/downloads/) instalado.

### Pasos

1.  **Clona el repositorio (si aplica)**
    ```bash
    git clone <url-del-repositorio>
    cd <nombre-del-directorio>
    ```

2.  **Crea y activa un entorno virtual**

    Es una buena práctica aislar las dependencias del proyecto.

    ```bash
    # Crea el entorno virtual
    python -m venv venv
    ```

    ```bash
    # Actívalo en Windows
    .\venv\Scripts\activate
    ```
    
    ```bash
    # Actívalo en macOS/Linux
    source venv/bin/activate
    ```

3.  **Instala las dependencias**

    El archivo `requirements.txt` contiene todas las librerías necesarias.

    ```bash
    pip install -r requirements.txt
    ```

4.  **Ejecuta la aplicación**

    ```bash
    python app.py
    ```

5.  **Abre la aplicación en tu navegador**

    Una vez que el servidor esté corriendo, visita la siguiente URL en tu navegador:
    [http://localhost:8080](http://localhost:8080)

    [http://localhost:8080](http://localhost:8080)

## Developer Tools (Local Verification)

If you want to run the checks locally before pushing:

### 1. Linting
```bash
# Python
flake8 .
# JavaScript
npm install
npm run lint
```

### 2. Tests
```bash
# Backend
pip install -r requirements-dev.txt
pytest
# Frontend (E2E)
npx playwright install --with-deps
npm run test:e2e
```

## Despliegue en Google Cloud con App Engine

Esta aplicación está lista para ser desplegada en Google Cloud Platform (GCP) utilizando App Engine.

### Prerrequisitos

- Tener una cuenta de Google Cloud con un proyecto activo.
- Tener la [CLI de Google Cloud (`gcloud`)](https://cloud.google.com/sdk/docs/install) instalada y configurada.

### Pasos para el Despliegue

1.  **Autenticación y Configuración del Proyecto**

    Asegúrate de que tu CLI esté autenticada y apuntando al proyecto correcto.

    ```bash
    # Autentícate con tu cuenta de Google
    gcloud auth login

    # Establece el proyecto en el que quieres desplegar
    gcloud config set project TU_ID_DE_PROYECTO
    ```

2.  **Configurar Google Analytics (Opcional)**

    Si quieres usar Google Analytics, abre el archivo `app.yaml` y añade tu ID de Medición. Descomenta y edita la siguiente línea:

    ```yaml
    # app.yaml
    env_variables:
      # GOOGLE_ANALYTICS_ID: "G-XXXXXXXXXX"
      FLASK_ENV: "production"
    ```

3.  **Desplegar la Aplicación**

    Desde la raíz de tu proyecto (donde se encuentra `app.yaml`), ejecuta el siguiente comando:

    ```bash
    gcloud app deploy
    ```

    La CLI de `gcloud` se encargará de empaquetar tu código, subirlo a Google Cloud y desplegarlo.

4.  **Abrir la Aplicación Desplegada**

    Una vez que el despliegue haya finalizado, puedes abrir la aplicación en tu navegador con el siguiente comando:

    ```bash
    gcloud app browse
    ```


