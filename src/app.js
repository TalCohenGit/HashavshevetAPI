// *************** MAIN APP SERVER *************ss**
/*
++ remove db call in bi data. insted deliver the items names from ui
++ regular async functions on start
   
   * update items/castumers report
   * check prems


*/
//const axios = require()
//const Buffer = require("buffer");
//const Buffer = require("node:buffer");
const download = require("download");
const castumReports = require("./castumReports");
const crypto = require("crypto");
const express = require("express");
const app = express();
const fs = require("fs");
//const PORT = process.env.PORT || 3000;
const PORT = 3000;
const cors = require(`cors`);
const bodyParser = require("body-parser");
const DBrouter = require("./routs/dbRouts");
const documentCreator = require(`./Helpers/wizCloudUtiles/apiInterface/DocumentCreator`);
const reportsCreator = require("./Helpers/wizCloudUtiles/apiInterface/flexDoc");
const Helper = require("./Helpers/generalUtils/Helper");
const matrixesHandeler = require("./Helpers/wizCloudUtiles/helpers/calcKi");
const PDFMerger = require("pdf-merger-js");
const utfZone = "en";
const uri = "mongodb+srv://yotamos:linux6926@cluster0.zj6wiy3.mongodb.net/mtxlog?retryWrites=true&w=majority";
const mongoose = require("mongoose");
const { report } = require("./routs/dbRouts");
const { default: axios } = require("axios");
const { Blob } = require("buffer");
const { fileURLToPath } = require("url");
const MGoptions = { useNewUrlParser: true, useUnifiedTopology: true };
mongoose
  .connect(uri, MGoptions)
  .then((res) => console.log("conected to mongo...."))
  .catch((e) => console.log(e));

const storedReports = new mongoose.Schema(
  {
    userID: String,
    Date: Date,
    ID: String,
    Report: Object,
  },
  { timestamps: true, strict: true, strictQuery: false }
);

const StoredReports = mongoose.model("StoredReports", storedReports);

app.use(
  cors({
    origin: "*",
  })
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());
app.use(DBrouter);

app.post("/api/showDocument", async (req, res) => {
  let reso = await documentCreator.showDocument();
  res.send(reso);
});

app.post("/api/mergepdfs", Helper.authenticateToken, async (req, res) => {
  const Filename = req?.headers["filename"];
  const pb = false;

  pd && setProgressBar(Filename, { stageName: 1, text: "פונקציית mergePdf מתחילה לעבוד" }, false);
  console.log("%%%%%%%%%%% merge pdfs%%%%%%%%%");
  res.contentType("application/pdf");
  let pdfsObject;
  try {
    pdfsObject = await req.body;
  } catch (err) {
    pb && setProgressBar(Filename, { stageName: 2, text: "תקלה" }, false);
    return res.send(err);
  }
  const Urls = await pdfsObject.map((doc) => doc.DocUrl);
  const merger = new PDFMerger();
  let Errors = [];

  for (let i = 0; i <= Urls.length - 1; i++) {
    console.log(Urls[i], typeof Urls[i]);
    let urlIsBrocken = false;
    let Err;
    await download(Urls[i])
      .then((file) => {
        pb && setProgressBar(Filename, { stageName: `a${i}`, text: "ממזג קןבץ " }, true, i + 1, Urls.length);
        fs.writeFileSync(`./${i}.pdf`, file);
      })
      .catch((err) => {
        console.log(err);
        Err = err;
        urlIsBrocken = true;
      });
    if (urlIsBrocken) {
      pb &&
        setProgressBar(Filename, { stageName: `a${i}`, text: "קישור תקול", termenate: true }, true, i + 1, Urls.length);
      return res.send({ status: "no", data: "urls brocken getting 404" });
    }

    try {
      await merger.add(`./${i}.pdf`);
      fs.unlinkSync(`./${i}.pdf`);
    } catch (e) {
      console.log(e);
      Errors.push({
        msg: e,
        DocNumber: pdfsObject[i].DocNumber,
      });
    }
  }
  console.log("errors 2222222", Errors);

  await merger
    .saveAsBuffer()
    .then((mergedPdfBuffer) => {
      fs.writeFileSync("./merged.pdf", mergedPdfBuffer);
    })
    .then(() => {
      let Files = fs.readFileSync("./merged.pdf");
      console.log("after save merger !!!!!");
      res.setHeader("errors", Errors);
      pb && setProgressBar(Filename, { stageName: `sc`, text: "סיים בהצלחה", termenate: true }, false);
      res.send(Files);
    })
    .catch((err) => {
      pb && setProgressBar(Filename, { stageName: `sc`, text: "סיים בתקלה", termenate: true }, false);
      res.send({ status: "no", data: err });
    });
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use(express.json());
app.listen(PORT, (err) => console.log(`matrix UI server ${err ? " on" : "listening"} port ${PORT}`));
//close cyrcle function
app.post("/api/generatekey", async (req, res) => {
  res.send({ key: crypto.randomBytes(32).toString("hex") });
});

const setProgressBar = async (filename, messageData, gotStats, currentDoc, totalDocs) => {
  const data = {
    termenate: messageData?.termenate ? true : false,
    stageName: typeof messageData == "object" ? messageData.stageName : "in process",
    msg: typeof messageData == "object" ? messageData.text : messageData,
    gotStats: gotStats,
    stats: {
      amountFinished: currentDoc ? currentDoc : 0,
      totalToProcess: totalDocs ? totalDocs : 0,
    },
  };
  let path = `./${filename}.json`;
  updateProgressBar(filename, data);
};

const updateProgressBar = async (filename, progressData) => {
  console.log("IN PROGRESS BAR --", { filename, progressData });
  const data = progressData;
  let path = "./" + filename + ".json";
  if (fs.existsSync(path)) fs.writeFileSync(path, JSON.stringify(data), { encoding: "utf8", flag: "w" });
  else fs.writeFileSync(path, JSON.stringify(data), { encoding: "utf8" });
};

app.post("/api/createdoc", Helper.authenticateToken, async (req, res) => {
  console.log("%%%%%%%%%%% in create docs %%%%%%%%%");
  const Filename = req?.headers["filename"];

  let oauth = req.headers["authorization"];
  let addedValue;

  const matrixesData = await req.body;
  console.log({ matrixesData });

  setProgressBar(Filename, { stageName: "start", text: "מאתחל...." }, false);

  let userID;
  try {
    userID = (await req.user?.fetchedData?.userID) ? req.user.fetchedData.userID : req.user.userID;
    console.log("userID", userID);
  } catch (e) {
    return res.send({
      status: `no, user id invalid value ${userID}`,
      data: JSON.stringify(e),
    });
  }

  let Action;
  let logArrey = [];

  setProgressBar(Filename, { stageName: "a", text: "מכין מטריצה לעיבוד" }, false);
  console.log("sssssssssssssssssssssfadggasdgs", Object.keys(matrixesData));
  matrixesHandeler
    .prererMatixesData(matrixesData)
    .then(async (result) => {
      setProgressBar(Filename, { stageName: "b", text: "שומר תוכן מטריצות במסד נתונים" }, false);
      const dataToSave = await matrixesHandeler.constructMatrixToDbObjB(req);
      const saveStatus = await Helper.saveMatrixesToDB(dataToSave, true);
      const statusMsg = saveStatus.resultData.status == "yes" ? "נשמר בהצלחה" : "תקלה בתהליך השמירה ";

      setProgressBar(Filename, { stageName: "c", text: statusMsg }, false);
      return result;
    })
    .then(async (result) => {
      Action = result.ActionID;
      let allData = result.data.docData;
      console.log({ allData });
      let data = await allData.filter((row, idx) => {
        if (matrixesData.matrixesData.mainMatrix.ActionID[idx] == 1) return row;
      });

      const dataLength = data.length;
      console.log("************* data length **************\n", dataLength);
      for (let i = 0; i <= data.length - 1; i++) {
        await documentCreator
          .createDoc(data[i], i, userID)
          .then(async (docOutPut) => {
            setProgressBar(Filename, { stageName: `f${i}`, text: "מפיק מסמך" }, true, i + 1, dataLength);
            console.log({ docOutPut });
            if (docOutPut?.status == "no") {
              setProgressBar(Filename, { stageName: "finish", text: "תקלה בהפקת מסמכים" });
              return res.send({ status: "no", data: "error in docOutPut" });
            }
            if (i == 0) addedValue = docOutPut[0]["DocumentDetails"][0][0]["DocNumber"];

            return await Helper.createRetJson(docOutPut, i, Action, userID, addedValue);
          })
          .then(async (docResult) => {
            logArrey.push(docResult);
          });
      }
    })
    .then(async () => {
      setProgressBar(Filename, { stageName: "S", text: "שומר תוצאות במסד הנתונים" }, false);

      // _______________________________________________________________//
      return await Helper.saveDocURL(logArrey, oauth);
    })
    .then((result) => {
      setProgressBar(Filename, { stageName: "finish", text: "המסמכים הופקו", termenate: true }, false);
      res.send(JSON.stringify({ status: "yes", data: result }));
    })
    .catch((err) => {
      console.log(`catch in main loop...\n ${err}`);
      setProgressBar(Filename, { stageName: "finish", text: "תקלה בהפקת המטריצה" }, false);
      // deleteProgressFile(Filename);
      res.send(JSON.stringify({ status: "no", data: err }));
    });
});

app.post("/api/initvalidate", Helper.authenticateToken, async function (req, res) {
  const { usserDbname, usserPrivetKey, usserServerName } = await req.body;
  // console.log("********************* DATA IN REQUEST **********************");
  console.table({ usserDbname, usserPrivetKey, usserServerName });
  try {
    documentCreator
      .validateInitialData(usserDbname, usserPrivetKey, usserServerName)
      .then((result) => res.send(result))
      .catch((e) => {
        console.log(e);
        res.send(e);
      });
  } catch (e) {
    console.log(e);
  }
});

app.post("/api/getrecords", Helper.authenticateToken, async function (req, res) {
  console.log("~~~~~~~~~~~~~ getrecords ~~~~~~~~~~~~~~~~~");

  const columnToValidate = await req.body.columnToValidate;

  let checkUserID = await Helper.getUsserID(req);
  if (checkUserID.status == false) return res.send(checkUserID.data);
  let userID = checkUserID.data;

  let searchData;
  let isNew;
  let isSended = false;
  const reportData = await req.body;
  console.log(reportData);
  const UPDATE_TIME_INTERVAL = 1000 * 12;
  await StoredReports.find({ ID: JSON.stringify(reportData), userID: userID })
    .then(async (report) => {
      let len = report.length;
      console.log({ len });
      report.length == 0 ? (isNew = true) : (isNew = false);
      searchData = report;
      const DATA_TO_log = report[0]._doc;
      console.log("date in report", DATA_TO_log.Date);

      if (!isNew) {
        const currentTime = new Date().getTime();
        //.toLocaleStrinutfZone, {
        //   timeZone: "Asia/Jerusalem",
        // }).getTime();

        const reportTime = new Date(report[0]._doc.Date).getTime();
        console.table({ currentTime, reportTime });
        if (currentTime - reportTime < UPDATE_TIME_INTERVAL) {
          isSended = true;
          let validationMsg = await Helper.checkDataValidation(report[0]._doc.Report.jsondata, columnToValidate);
          console.log("data sended to client ");
          isNew = false;
          let jsonData = report[0]._doc.Report.jsondata;
          res.send({
            status: report[0].Report ? "yes from fast DB" : `no, report data invalid value ${report[0].Report} `,
            data: jsonData,
            validationError: validationMsg ? validationMsg : null,
          });
        }
      }
    })
    .catch((e) => console.log(e));
  // console.log(reportData);

  reportData.TID != "4"
    ? reportsCreator
        .exportRecords(reportData, userID)
        .then(async (jsondata) => {
          let validationMsg = await Helper.checkDataValidation(jsondata, [1, 2]);
          return { jsondata, validationMsg };
        })
        .then(async (jsondata, validationMsg) => {
          const reportObject = {
            userID: userID,
            Date: new Date().toLocaleString(utfZone, {
              timeZone: "Asia/Jerusalem",
            }),
            ID: JSON.stringify(reportData),
            Report: jsondata,
          };
          const report = new StoredReports(reportObject);
          //   console.log("&&& searchData &&&& \n", searchData);
          isNew
            ? report
                .save()
                .then((data) => {
                  console.log(" is new save ", data);
                })
                .catch((e) => {
                  console.log(e);
                })
            : StoredReports.updateOne(
                { ID: JSON.stringify(reportData) },
                {
                  $set: { ...reportObject, id: searchData._id },
                }
              )
                .then((result) => console.log(result))
                .catch((e) => console.log(e));

          !isSended
            ? res.send({
                status: (await jsondata) ? "yes from slow DB" : `no, NO JSON DATA IN SLOW DB VALUE ${jsondata}`,
                data: jsondata.jsondata,
                validationError: validationMsg ? validationMsg : null,
              })
            : console.log("updating report");
        })
        .catch((e) => {
          console.debug(e);
          !isSended && res.send({ status: "no, IN CALL END ", data: e });
        })
    : console.log("*** castum Reports Section ***");
});

app.post("/api/flexdoc", async function (req, res) {
  // console.log(`/n*************************Request details***********************\n
  // ${JSON.stringify(req)}\n`)

  let fileCod = await req.body;
  //console.log("reqqqqqq +++++ " + JSON.stringify(fileCod));

  const jsdata = await castumReports.exportCastumersRecords(fileCod);
  // consolgge.log(jsdata);
  //console.log(jsdata);
  let parsed = await JSON.parse(jsdata);
  fs.writeFileSync("jsonData.json", JSON.stringify(parsed.status.repdata, null, 2), (err) => console.log);
  res.send(jsdata).end();
});

app.post("/api/test", async function (req, res) {
  try {
    let reqData = await req.body;
    let matrixData = await reqData.matrixesData;
    console.log(reqData);
    res.json(reqData);
  } catch (err) {
    console.dir(err);
  }
});

app.post("/api/getProgressBar", async (req, res) => {
  const Filename = req.headers["filename"];
  const TimeLimit = parseInt(req.headers["timelimit"]);

  console.log("IN GET PROGRESS DATA ", { Filename, TimeLimit });
  let path = "./" + Filename + ".json";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const { id } = await req.body;
  res.status(200);
  let runtime = 0;
  let stageName = "";
  let intervals = setInterval(() => {
    console.log("IN GET PROGRESS DATA ", { Filename, TimeLimit, runtime });
    let file_exist = fs.existsSync(path);
    console.log({ file_exist });
    if (file_exist) {
      let result = JSON.parse(fs.readFileSync(path, { encoding: "utf8", flag: "r" }));
      console.log("file exist");

      if (result.stageName == "finish" || result?.termenate) {
        toBreak = true;
        clearInterval(intervals);
        res.write("finish");
        fs.unlinkSync(path);
        return res.end();
      }

      if (result.stageName != stageName) {
        stageName = result.stageName;
        res.write(JSON.stringify(result));
        console.log("file updated");
      }
    }

    runtime += 1;

    let limit = TimeLimit ? TimeLimit * 2 : 60;

    if (runtime > limit) {
      res.write("to long");
      file_exist && fs.unlinkSync(path);
      clearInterval(intervals);
      return res.end(" out");
    }
  }, 500);
});
