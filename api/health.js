// Liveness check. Proves the API layer is mounted. Reveals nothing about configuration.
export default {
  fetch() {
    return Response.json({ ok: true, service: 'creva', time: new Date().toISOString() });
  },
};
