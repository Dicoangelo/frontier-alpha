// Migration for clients previously registered by vite-plugin-pwa.
// Both legacy registration URLs now run the same worker and cache policy.
importScripts('/sw.js?cache-policy=v2');
