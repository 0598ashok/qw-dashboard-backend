const bcrypt = require("bcrypt");

(async () => {
    const hash = await bcrypt.hash("hR.2025@", 10);
    console.log(hash);
})();