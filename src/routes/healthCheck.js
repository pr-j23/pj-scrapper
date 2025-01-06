const express = require('express')

const router = express.Router()

router.get("/api/v1/health", (req, res) => {
    return res.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    })
})

module.exports = router