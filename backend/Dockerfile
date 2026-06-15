FROM node:20

WORKDIR /app

# Install ODBC runtime
RUN apt-get update && \
    apt-get install -y \
    unixodbc \
    unixodbc-dev \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]