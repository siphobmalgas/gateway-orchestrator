
db = db.getSiblingDB("provider-cred-db");
db.createUser({
  user: "provider_creds_user",
  pwd: "provider_creds_pass001",
  roles: [{ role: "readWrite", db: "provider-cred-db" }]
});
