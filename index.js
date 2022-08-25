const { program } = require('commander');
const winston = require('winston');
const moment = require('moment');
const cliProgress = require('cli-progress');

const { findCode } = require('./code')

const bar = new cliProgress.SingleBar({
    format: '[{bar}] {percentage}% {total}分钟'
}, cliProgress.Presets.shades_classic);

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

// 参数解析
program
    .version('1.0.0')
    .requiredOption('--browser-path <path>')
    .requiredOption('-u,--user <your user account>')
    .requiredOption('-p,--password <your password>')
    .requiredOption('--base-url <index page url>')
    .requiredOption('--course-id <courseID>')
    .option('--debug')
    .option('--show-browser');
// .requiredOption();

program.parse();

const options = program.opts();

const myFormat = winston.format.printf(({ level, message }) => {
    let timeStamp = moment().format("YYYY-MM-DD HH:mm:ss");
    return `[${timeStamp}] [${level}]: ${message}`;
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        myFormat
    ),
    transports: [
        new winston.transports.File({ filename: 'auto.log' })
    ]
});

if (true == options.debug) {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

const indexUrl = options.baseUrl;
logger.info("start")
logger.info("the url is " + indexUrl);
logger.info("course id is " + options.courseId);
logger.info("user account is " + options.user);
logger.info("brower path is " + options.browserPath);

puppeteer.launch({
    headless: !options.showBrowser,
    defaultViewport: { width: 1920, height: 1080 },
    executablePath: options.browserPath,
    args: ['--start-maximized']
}).then(async browser => {
    logger.info("brower start successfully")

    const page = await browser.newPage()

    // 开始登陆
    let loginBase64 = ""
    do {
        // 切换到登录界面
        await page.goto(indexUrl + "/user/login", {
            waitUntil: 'networkidle0'
        })
        // 输入用户名和密码
        await page.type('#username', options.user, { delay: 100 });
        await page.type('#password', options.password, { delay: 100 });
        // 定位登录验证码
        let loginCode = await page.$('#codeImg');
        // 获取登录验证码base64编码
        loginBase64 = await loginCode.screenshot({
            encoding: "base64"
        });
        logger.info("loginCodeBase64:")
        logger.info(loginBase64)
        // 识别验证码
        let codeBase64 = await findCode(loginBase64)
        logger.info("loginCode may be " + loginBase64)
        // 输入验证码
        await page.type('#code', await codeBase64, { delay: 100 });
        await page.waitForTimeout(2000)

        // 点击登录按钮
        await page.click('div.loginnew:nth-child(1) div.loginnew-wrap div.mainbox:nth-child(2) div.loginnew-main form:nth-child(2) div.list div.item:nth-child(5) div.inpbox > input.btn:nth-child(2)', { delay: 100 });
        await page.waitForTimeout(2000)

        // 跳出循环条件为用户是否仍在登录界面
    } while (indexUrl + "/user/login" == page.url());
    logger.info("login successfully")
    await page.waitForTimeout(2000)

    // 跳转到课程详情界面
    await page.goto(indexUrl + "/user/study_record?courseId=" + options.courseId);
    logger.info("goto " + indexUrl + "/user/study_record?courseId=" + options.courseId);
    await page.waitForTimeout(2000)

    let pageCountEle = await page.$('.total').then(async list => {
        return await list.$$('span').then(async span => {
            return span[2]
        })
    })
    // 获取视频页码
    const pageCount = await page.evaluate(el => el.textContent, pageCountEle);
    logger.info("pageCount:" + pageCount);

    while (true) {
        let couresInfo = "";

        // let scoreTable=await page.$('.score-table').then(async table => {
        //     return await table.$$('tr').then(async tr => {
        //         return await (tr[1]).$('')
        //     })
        // })
        // 获取视频列表页数
        for (let i = 0; i < pageCount; i++) {
            await page.goto(indexUrl + "/user/study_record?courseId=" + options.courseId + "&page=" + String(i + 1), {
                waitUntil: 'networkidle0'
            });

            // 获取视频列表
            let videoEleList = await page.$('#list').then(async list => {
                return await list.$('tbody').then(async tbody => {
                    return await tbody.$$('tr')
                })
            })

            for (let j = 0; j < videoEleList.length; j++) {
                let ele = videoEleList[j];
                let urlEle = await ele.$('td:first-child').then(async td => {
                    return await td.$('a')
                })
                let stateEle = await ele.$('td:last-child').then(async td => {
                    return await td.$('span')
                })
                let timeEle = (await ele.$$('td'))[5]
                if ("已学" != await page.evaluate(el => el.textContent, stateEle)) {
                    couresInfo = {
                        "url": await page.evaluate(el => el.href, urlEle),
                        "time": moment.duration(await page.evaluate(el => el.textContent, timeEle)).asMilliseconds(),
                        "state": await page.evaluate(el => el.textContent, stateEle),
                        "title": await page.evaluate(el => el.textContent, urlEle)
                    }
                    break;
                }
            }

            if ("" != couresInfo) {
                break;
            }
        }
        if ("" == couresInfo) {
            break;
        } else {
            logger.info("courseInfo " + couresInfo);
            page.goto(couresInfo.url)
            await page.waitForTimeout(1000)

            const theClassName = await page.$('#videoContent').then(async el1 => {
                return await el1.$('div').then(async el2 => {
                    return ((await el2.$eval('div', el => el.getAttribute('class'))).split("controlbgbar"))[1]
                })
            })
            // console.log("获取随机class后缀:", theClassName)
            let playPosition = await page.$('.play' + theClassName).then(async res => {
                return await res.boundingBox()
            })

            // console.log("定位播放按钮位置:", playPosition);
            logger.info("player position " + playPosition);

            var codeTab = await page.$(".layui-layer-wrap");
            var playingState = await page.$$(".play" + theClassName).then(async res => {
                return await page.evaluate(
                    (x) => { return JSON.parse(JSON.stringify(window.getComputedStyle(x))) },
                    res[0]
                );
            })
            // 输入验证码循环
            do {
                // 鼠标移动到播放按钮中间，避免bar下沉
                await page.mouse.move(playPosition.x + playPosition.width / 2, playPosition.y + playPosition.height / 2);
                await page.mouse.down();
                await page.mouse.up();

                await page.waitForTimeout(2000)
                // 检测是否有验证码弹窗
                codeTab = await page.$(".layui-layer-wrap");
                if (codeTab) {
                    // 如果需要输入验证码
                    logger.info("need code");
                    let usefulContent = await codeTab.$$("div").then(async ele1 => {
                        return ele1[1]
                    })
                    let codeEle = await usefulContent.$$("img").then(async res => {
                        return res[1];
                    })
                    let input = await usefulContent.$$("input").then(async res => {
                        return res[1];
                    })
                    let codeBase64 = await codeEle.screenshot({
                        encoding: "base64"
                    })

                    input.click();
                    page.keyboard.type(await findCode(codeBase64), { delay: 100 });
                    await page.waitForTimeout(1000)
                    await page.keyboard.press('Enter');
                }
                await page.waitForTimeout(2000)
                playingState = await page.$$(".play" + theClassName).then(async res => {
                    return await page.evaluate(
                        (x) => { return JSON.parse(JSON.stringify(window.getComputedStyle(x))) },
                        res[0]
                    );
                })
                // console.log("当前播放状态", "block" == playingState.display ? "暂停" : "播放")
            } while ("block" == playingState.display)
            logger.info("start successfully")
            // 获取随机等待值，防止被追踪，数值范围为0-100000毫秒
            let randomTime = Math.floor(Math.random() * 100000 + 100000)
            // console.log("视频时长:", moment.duration(couresInfo.time).humanize())
            // console.log("防检测随机时长:", moment.duration(randomTime).humanize())
            // console.log("需要:", moment.duration(parseInt(couresInfo.time) + parseInt(randomTime)).humanize())
            let totalTime = parseInt(couresInfo.time) + parseInt(randomTime)
            logger.info("need " + totalTime.toString() + "ms");
            console.log(couresInfo.title);
            // 换算为分钟
            bar.start((totalTime / 1000 / 60).toFixed(1), 0)
            let i = 0
            const timer = setInterval(function () {
                i++;
                bar.update(i);
                if (i >= bar.getTotal()) {
                    clearInterval(timer);
                    logger.info("done");
                    onComplete.apply(this)
                    bar.stop();
                    console.log('');
                }
            }, 60000)
            await page.waitForTimeout(parseInt(couresInfo.time) + parseInt(randomTime))
        }
    }
    console.log("学习完成");
    logger.end();
    await page.close();
    await browser.close();
})