const express = require("express");
const axios = require("axios"); // Import 'axios' instead of 'request'
const request = require("request");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 5404;

app.use(bodyParser.json());
app.use(cors());

const usersFilePath = "./users.json";

// Read the M-Pesa certificate file
const certificate = fs.readFileSync(
  path.join(__dirname, "./SandboxCertificate.cer")
);

// Initiator password (unencrypted)
const initiatorPassword = "Safaricom999!*!";

// Encrypt the password using RSA algorithm with PKCS #1.5 padding
const encryptedPassword = crypto.publicEncrypt(
  {
    key: certificate,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  },
  Buffer.from(initiatorPassword)
);

// Convert the encrypted byte array into a base64 encoded string
const securityCredential = encryptedPassword.toString("base64");

// Helper function to read users from JSON file
const readUsersFromFile = () => {
  try {
    const data = fs.readFileSync(usersFilePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading users file:", err);
    return [];
  }
};

// Helper function to write users to JSON file
const writeUsersToFile = (users) => {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing users file:", err);
  }
};

let users = readUsersFromFile();

let loggedInUser = null;

app.post("/authenticate", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  if (user) {
    loggedInUser = user;
    res.status(200).json({ success: true, user });
  } else {
    res
      .status(401)
      .json({ success: false, message: "Invalid username or password" });
  }
});

app.post("/register", (req, res) => {
  const { username, password, phoneNumber } = req.body;
  const userExists = users.some((u) => u.username === username);
  if (userExists) {
    res
      .status(400)
      .json({ success: false, message: "Username already exists" });
  } else {
    let formattedPhoneNumber = phoneNumber;
    if (formattedPhoneNumber.startsWith("+2547")) {
      formattedPhoneNumber = "0" + formattedPhoneNumber.slice(4);
    } else if (formattedPhoneNumber.startsWith("2547")) {
      formattedPhoneNumber = "0" + formattedPhoneNumber.slice(3);
    }

    const newUser = {
      username,
      userID: String(users.length + 1).padStart(3, "0"),
      password,
      balance: 0,
      phoneNumber: formattedPhoneNumber,
    };
    users.push(newUser);
    writeUsersToFile(users);
    loggedInUser = newUser; // Set the logged-in user after registration
    res.status(200).json({ success: true, user: newUser });
  }
});

app.get("/user-info", (req, res) => {
  if (loggedInUser) {
    res.status(200).json({ success: true, user: loggedInUser });
  } else {
    res.status(401).json({ success: false, message: "User not logged in" });
  }
});

// Endpoint to log out the current user
app.post("/logout", (req, res) => {
  loggedInUser = null;
  res
    .status(200)
    .json({ success: true, message: "User logged out successfully" });
});

// Endpoint to increase the balance of the user identified by userID
app.post("/increase-balance", (req, res) => {
  const { userID, amount } = req.body;
  const user = users.find((u) => u.userID === userID);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  user.balance += amount;
  writeUsersToFile(users);

  // If the updated user is the logged-in user, update the loggedInUser as well
  if (loggedInUser && loggedInUser.userID === userID) {
    loggedInUser.balance = user.balance;
  }

  res.status(200).json({ success: true, user });
});

// Endpoint to reduce the balance of the user identified by userID
app.post("/reduce-balance", (req, res) => {
  const { userID, amount } = req.body;
  const user = users.find((u) => u.userID === userID);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  if (user.balance < amount) {
    return res
      .status(400)
      .json({ success: false, message: "Insufficient balance" });
  }

  user.balance -= amount;
  writeUsersToFile(users);

  // If the updated user is the logged-in user, update the loggedInUser as well
  if (loggedInUser && loggedInUser.userID === userID) {
    loggedInUser.balance = user.balance;
  }

  res.status(200).json({ success: true, user });
});

// ACCESS TOKEN FUNCTION - Updated to use 'axios'
async function getAccessToken() {
  const consumer_key = "Gt9wGozS7C5nd1KgoyGljujpgtNkG6IHTjxhdeuPTX7RhWE0"; // REPLACE IT WITH YOUR CONSUMER KEY
  const consumer_secret =
    "UR0TY8yzAI3FAN5R1bh6JwJYCJ0uoYoxN3Bp8JNE7nssq8MStht8wyecZ9RdCZfu"; // REPLACE IT WITH YOUR CONSUMER SECRET
  const url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const auth =
    "Basic " +
    new Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: auth,
      },
    });
    const dataresponse = response.data;
    // console.log(data);
    const accessToken = dataresponse.access_token;
    return accessToken;
  } catch (error) {
    throw error;
  }
}

function getCurrentTimeFormatted() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

//ACCESS TOKEN ROUTE
app.get("/access_token", (req, res) => {
  getAccessToken()
    .then((accessToken) => {
      res.send("Your access token is " + accessToken);
    })
    .catch(console.log);
});

// Endpoint for depositing money to a user's account
app.post("/deposit", (req, res) => {
  const { userID, amount } = req.body;
  const user = users.find((u) => u.userID === userID);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  let phoneNumber = user.phoneNumber;

  if (phoneNumber.startsWith("0")) {
    phoneNumber = "254" + phoneNumber.slice(1);
  } else if (phoneNumber.startsWith("+254")) {
    phoneNumber = phoneNumber.slice(1);
  }

  getAccessToken().then((accessToken) => {
    const url =
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
    const auth = "Bearer " + accessToken;
    var timestamp = getCurrentTimeFormatted();
    const password = new Buffer.from(
      "174379" +
        "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" +
        timestamp
    ).toString("base64");

    request(
      {
        url: url,
        method: "POST",
        headers: {
          Authorization: auth,
        },
        json: {
          BusinessShortCode: "174379",
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phoneNumber, //phone number to receive the stk push
          PartyB: "174379",
          PhoneNumber: phoneNumber,
          CallBackURL: "https://nodebackend-btr7.onrender.com/callback",
          AccountReference: "PESAFAST DEPOSIT",
          TransactionDesc: "Mpesa STK push for pesafast deposit",
        },
      },
      function (error, response, body) {
        if (error) {
          console.log(error);
        } else {
          console.log(body);
          res.status(200).json(body);
        }
      }
    );
  });

  /*
  user.balance += amount;
  writeUsersToFile(users);

  // If the updated user is the logged-in user, update the loggedInUser as well
  if (loggedInUser && loggedInUser.userID === userID) {
    loggedInUser.balance = user.balance;
  }
  */

  //res.status(200).json({ success: true, user });
});

// Route for STK push callback
app.post("/callback", (req, res) => {
  console.log("STK PUSH CALLBACK");
  console.log("-----------------");
  console.log(req.body); // Logging request body

  // Assuming req.body is already a parsed JSON object
  const MerchantRequestID = req.body.Body.stkCallback.MerchantRequestID;
  const CheckoutRequestID = req.body.Body.stkCallback.CheckoutRequestID;
  const ResultCode = req.body.Body.stkCallback.ResultCode;
  const ResultDesc = req.body.Body.stkCallback.ResultDesc;

  if (ResultCode === 0) {

    console.log(ResultCode);
    console.log(ResultDesc);

    const callbackData = req.body.Body.stkCallback.CallbackMetadata.Item;

    // Initialize variables to store the extracted values
    let amount, mpesaReceiptNumber, transactionDate, phoneNumber;

    // Loop through the items and assign the values to respective variables
    callbackData.forEach((item) => {
      switch (item.Name) {
        case "Amount":
          amount = item.Value;
          break;
        case "MpesaReceiptNumber":
          mpesaReceiptNumber = item.Value;
          break;
        case "TransactionDate":
          transactionDate = item.Value;
          break;
        case "PhoneNumber":
          phoneNumber = item.Value;
          break;
        default:
          break;
      }
    });

    // Log the extracted variables
    console.log("Amount:", amount);
    console.log("MpesaReceiptNumber:", mpesaReceiptNumber);
    console.log("TransactionDate:", transactionDate);
    console.log("PhoneNumber:", phoneNumber);

    try {
      // Find the user based on the phone number
      const user = users.find((u) => u.phoneNumber === phoneNumber);

      if (!user) {
        console.error("User not found");
        return res.status(404).send("User not found");
      }

      // Update the user's balance
      user.balance += amount;
      writeUsersToFile(users);

      // If the updated user is the logged-in user, update the loggedInUser as well
      if (loggedInUser && loggedInUser.userID === user.userID) {
        loggedInUser.balance = user.balance;
      }

      // Format the transaction data to save
      const currentDate = new Date();
      const formattedDateTime = currentDate.toLocaleString();
      const transactionData = {
        merchantRequestID: MerchantRequestID,
        checkoutRequestID: CheckoutRequestID,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
        amount: amount,
        mpesaReceiptNumber: mpesaReceiptNumber,
        transactionDate: transactionDate,
        phoneNumber: phoneNumber,
        savedDate: formattedDateTime,
        loaded: "false",
      };

      // Log the transaction data (you can also save this data to a file or database)
      console.log("Transaction data:", transactionData);

      res.sendStatus(200); // Send success response
    } catch (error) {
      console.error("Error:", error);
      res.status(400).send("Bad request"); // Send bad request response if an error occurs
    }
  } else{
    console.log(ResultCode);
    console.log(ResultDesc);
  }
});

// Path to the JSON file
const transactionsFilePath = path.join(__dirname, 'transactions.json');

// Function to read transactions from the JSON file
function readTransactionsFromFile() {
  if (!fs.existsSync(transactionsFilePath)) {
    return [];
  }
  const fileData = fs.readFileSync(transactionsFilePath);
  return JSON.parse(fileData);
}

// Function to write transactions to the JSON file
function writeTransactionsToFile(transactions) {
  fs.writeFileSync(transactionsFilePath, JSON.stringify(transactions, null, 2));
}


// Endpoint for withdrawing money from a user's account
app.post("/withdraw", (req, res) => {
  const { userID, amount } = req.body;
  const user = users.find((u) => u.userID === userID);

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  if (user.balance < amount) {
    return res
      .status(400)
      .json({ success: false, message: "Insufficient balance" });
  }

  let phoneNumber = user.phoneNumber;

  if (phoneNumber.startsWith("0")) {
    phoneNumber = "254" + phoneNumber.slice(1);
  } else if (phoneNumber.startsWith("+254")) {
    phoneNumber = phoneNumber.slice(1);
  }

  getAccessToken()
    .then((accessToken) => {
      const url = "https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest";
      const auth = "Bearer " + accessToken;
      const uniqueID = generateOriginatorConversationID();

      return new Promise((resolve, reject) => {
        request(
          {
            url: url,
            method: "POST",
            headers: { Authorization: auth },
            json: {
              OriginatorConversationID: uniqueID,
              InitiatorName: "testapi",
              SecurityCredential: securityCredential,
              CommandID: "PromotionPayment",
              Amount: amount,
              PartyA: "600979",
              PartyB: phoneNumber,
              Remarks: "Pesafast Withdrawal",
              QueueTimeOutURL: "https://mydomain.com/b2c/queue",
              ResultURL: "https://nodebackend-btr7.onrender.com/b2c/result",
              Occasion: "Withdrawal",
            },
          },
          function (error, response, body) {
            if (error) {
              console.log("Request error:", error);
              reject(error);
            } else {
              console.log("Request body:", body);
              if (body.ResponseCode === "0") {
                console.log('body.ResponseCode === "0"');
                // Read the existing transactions from the JSON file
                const transactions = readTransactionsFromFile();

                // Add the new transaction to the transactions array
                transactions.push({
                  originatorConversationID: uniqueID,
                  userID: userID,
                  amountWithdraw: amount,
                  currentBalance: user.balance,
                  phoneNumber: phoneNumber,
                });

                // Write the updated transactions array back to the JSON file
                writeTransactionsToFile(transactions);

                console.log('Transaction recorded successfully.');
              }else{
                console.log('body.ResponseCode !== "0"');
              }
              resolve(body);
            }
          }
        );
      });
    })
    .then((body) => {
      res.status(200).json(body);
    })
    .catch((error) => {
      console.log("Token or request error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

// Helper function
function generateOriginatorConversationID() {
  const randomPart = Math.random().toString(36).substr(2, 8);
  const timestampPart = Date.now().toString(36);
  const conversationID = randomPart + "-" + timestampPart + "-1";
  return conversationID;
}

app.post("/b2c/result", (req, res) => {
  const result = req.body.Result;
  console.log("result");

  const resultType = result.ResultType;
  const resultCode = result.ResultCode;
  const resultDesc = result.ResultDesc;
  const originatorConversationID = result.OriginatorConversationID;

  // Update user balance and other necessary data using userID
  if (resultCode === 0) {
    // Read transactions from the JSON file
    const transactions = readTransactionsFromFile();

    // Find the transaction data using the originatorConversationID
    const transaction = transactions.find(
      (t) => t.originatorConversationID === originatorConversationID
    );

    if (transaction) {
      const { userID, amountWithdraw } = transaction;
      const user = users.find((u) => u.userID === userID);

      if (user) {
        // Deduct the amount from user's balance
        user.balance -= amountWithdraw;
        writeUsersToFile(users);

        // If the updated user is the logged-in user, update the loggedInUser as well
        if (loggedInUser && loggedInUser.userID === userID) {
          loggedInUser.balance = user.balance;
        }

        // Log successful transaction
        console.log(
          `Transaction successful: ${amountWithdraw} withdrawn from user ${userID}. New balance: ${user.balance}`
        );

        /*
        // Send confirmation message to the user's phone
        fetch("http://74.208.165.43:5404/api/single", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: String(user.phoneNumber),
            message: 'Withdrawal successful!' 
          })
        });
        */
      } else {
        console.error("User not found for the transaction.");
      }
    } else {
      console.error(
        "Transaction data not found for OriginatorConversationID:",
        originatorConversationID
      );
    }

  } else {
    // Handle transaction failure
    console.error(`Transaction failed: ${resultDesc}`);
  }

  res.sendStatus(200); // Send success response
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});


/*
echo "# NodeBackend" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/MetBeTech/NodeBackend.git
git push -u origin main
*/