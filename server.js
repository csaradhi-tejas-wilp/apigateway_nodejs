import express from 'express';
import fetch from 'node-fetch';

// Define the services and their respective ports
const services = {
  user: ['http://localhost:8081', 'http://localhost:8085'],
  restaurant: ['http://localhost:8082', 'http://localhost:8086'],
  order: ['http://localhost:8083', 'http://localhost:8087'],
  delivery: ['http://localhost:8090', 'http://localhost:8091']
};

// Round-robin tracker for each service
const serviceIndex = {
  user: 0,
  restaurant: 0,
  order: 0,
  delivery: 0
};

// Get the next server with failover logic
async function getNextAvailableServer(serviceName) {
  const servers = services[serviceName];
  const totalServers = servers.length;

  for (let i = 0; i < totalServers; i++) {
    const index = serviceIndex[serviceName];
    const targetServer = servers[index];

    // Update the index for the next request
    serviceIndex[serviceName] = (index + 1) % totalServers;

    // Check if the server is available
    try {
      const healthCheckUrl = `${targetServer}/health`; // Define a health check endpoint on each service
      const response = await fetch(healthCheckUrl);
      if (response.ok) {
        return targetServer; // Return the first available server
      }
    } catch (error) {
      console.warn(`Server ${targetServer} is unavailable. Trying the next one...`);
    }
  }

  // If no servers are available, return null
  return null;
}

const app = express();

app.use(express.json());

app.use('/:service/:path?', async (req, res) => {
  const serviceName = req.params.service;

  if (!services[serviceName]) {
    return res.status(404).send({ error: 'Service not found' });
  }

  const targetServer = await getNextAvailableServer(serviceName);

  if (!targetServer) {
    return res.status(500).send({ error: 'All servers are down' });
  }

  let targetPath = req.originalUrl;
  if (targetPath.endsWith('/') && targetPath.length > 1) {
    targetPath = targetPath.slice(0, -1); // Remove trailing slash
  }

  const targetUrl = `${targetServer}${targetPath}`;
  console.log(`Forwarding request for ${serviceName} to ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    res.status(response.status);
    response.headers.forEach((value, key) => res.set(key, value));
    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error(`Error forwarding request to ${targetUrl}:`, error.message);
    res.status(500).send({ error: 'Failed to forward request' });
  }
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`API Gateway is running on http://localhost:${PORT}`);
});
