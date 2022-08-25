const axios = require('axios')

const axiosConfig = {
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        // "Access-Control-Allow-Origin": "*",
    }
};

function findCode(base64) {
    return new Promise(resolve => {
        // var bodyFormData = new FormData();
        // bodyFormData.append('ImgBase64', base64);

        axios({
            method: "post",
            url: "http://api.95man.com:8888/api/Http/Recog?Taken=6eGkj3dw7iUQir0SaGu43AjOR1au&imgtype=1&len=4",
            data: { 'ImgBase64': base64 },
            headers: { "Content-Type": "multipart/form-data" },
        })
            .then(res => {
                // console.log("验证码识别API回调", res.data)
                resolve(res.data.split("|")[1])
            })
            .catch(error => {
                // console.error(error)
            })
    })
}

module.exports = {
    findCode
}