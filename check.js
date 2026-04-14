async function sync() {
    console.log("Triggering live Beds24 to Zoho sync...");
    const res = await fetch("https://admin.zagrodaalpakoterapii.com/api/admin/beds24-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearExisting: false, confirm: true })
    });
    console.log(await res.text());
}
sync();
