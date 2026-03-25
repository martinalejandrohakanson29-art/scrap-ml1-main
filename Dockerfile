# Usamos exactamente la versión que nos pidió el error para que todo coincida
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# El resto del proceso se mantiene igual
WORKDIR /app

# Copiamos los archivos de configuración
COPY package*.json ./

# Instalamos las dependencias (aquí se instalará Playwright 1.58.2)
RUN npm install

# Copiamos el resto del código
COPY . .

# Exponemos el puerto
EXPOSE 3000

# Arrancamos el servidor
CMD ["node", "server.js"]
