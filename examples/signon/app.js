/**
 * Basic example demonstrating passport-steam usage within Express framework
 */
// require('dotenv').config({path:__dirname+'.env'});
require("dotenv/config");
const { STRIPE_SECRET_KEY } = process.env;

const cors = require("cors");
var express = require("express"),
  passport = require("passport"),
  util = require("util"),
  session = require("express-session"),
  SteamStrategy = require("../../").Strategy;

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Steam profile is serialized
//   and deserialized.
const admin = require("firebase-admin");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const serviceAccount = require("./config/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://future-estate-f8bcf-default-rtdb.firebaseio.com",
});

var auth = admin.auth();
var db = admin.firestore();

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

// Use the SteamStrategy within Passport.
//   Strategies in passport require a `validate` function, which accept
//   credentials (in this case, an OpenID identifier and profile), and invoke a
//   callback with a user object.
passport.use(
  new SteamStrategy(
    {
      returnURL: "https://future-esate-api.onrender.com/auth/steam/return",
      realm: "https://future-esate-api.onrender.com",
      apiKey: "540CB51BC4C0450F8F3A95EB92606DAC",
    },
    function (identifier, profile, done) {
      // asynchronous verification, for effect...
      process.nextTick(function () {
        // To keep the example simple, the user's Steam profile is returned to
        // represent the logged-in user.  In a typical application, you would want
        // to associate the Steam account with a user record in your database,
        // and return that user instead.
        profile.identifier = identifier;
        return done(null, profile);
      });
    }
  )
);

var app = express();

// configure Express
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

app.use(
  session({
    secret: "your secret",
    name: "name of session id",
    resave: true,
    saveUninitialized: true,
  })
);
app.use(cors());

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + "/../../public"));
// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded());

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

app.get("/", async function (req, res) {
  if (req.user) {
    try {
      console.log(1);
      await auth.createUser({
        email: req.user.id + "@steam.com",
        password: req.user.id,
      });
      console.log(2, req.user.id);
      const ranking = await fetch(
        `http://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2?key=540CB51BC4C0450F8F3A95EB92606DAC&steamid=${req.user.id}&appid=730`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
          },
        }
      );
      
      const data = await ranking.json();
      console.log(3, data);
      const time = new Date();
      await db.collection('rewards').doc(req.user.id).set({
        dailyheadshot: data.playerstats.stats[23].value,
        dailykills: data.playerstats.stats[0].value,
        dailytime: time,
        monthlyheadshot: data.playerstats.stats[23].value,
        monthlykills: data.playerstats.stats[0].value,
        monthlytime : time,
        points: 0,
        weeklyheadshot: data.playerstats.stats[23].value,
        weeklykills : data.playerstats.stats[0].value,
        weeklytime: time,
        yearlyheadshot: data.playerstats.stats[23].value,
        yearlykills: data.playerstats.stats[0].value,
        yearlytime: 0,
      })
    } catch (e) {
      console.log(e);
    }
    res.redirect(
      `https://future-estate-iota.vercel.app/?success=true&id=${req.user.id}&name=${req.user.displayName}&url=${req.user.photos[2].value}`
    );
  }
  // console.log('authenticated in app');
  //res.redirect('http://localhost:3000?success=true');
  // res.render('index', { user: req.user });
});

app.get("/account", ensureAuthenticated, function (req, res) {
  res.render("account", { user: req.user });
});

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

// GET /auth/steam
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Steam authentication will involve redirecting
//   the user to steamcommunity.com.  After authenticating, Steam will redirect the
//   user back to this application at /auth/steam/return
app.get(
  "/auth/steam",
  passport.authenticate("steam", { failureRedirect: "/error" }),
  function (req, res) {
    res.redirect("/");
  }
);

// GET /auth/steam/return
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get(
  "/auth/steam/return",
  passport.authenticate("steam", { failureRedirect: "/" }),
  function (req, res) {
    res.redirect("/");
  }
);

app.get("/news-feed", async function (req, res) {
  try {
    const news = await fetch(
      "http://api.steampowered.com/ISteamNews/GetNewsForApp/v0002?appid=730",
      {
        method: "get",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
        },
      }
    );
    const data = await news.json();
    res.status(200).json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error!" });
  }
});

app.post("/pricing", async function (req, res) {
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
          price_data: {
            currency: "usd",
            product_data: {
              name: req.body.title,
            },
            unit_amount: 100 * Number(req.body.price),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.origin}/?pricing=true`,
      cancel_url: `${req.headers.origin}/?pricing=false`,
    });
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'internal server error' });
  }
});

app.get("/ranking", async function (req, res) {
  try {
    const ranking = await fetch(
      "https://api.steampowered.com/ICSGOServers_730/GetLeaderboardEntries/v1?format=json&lbname=official_leaderboard_premier_season1",
      {
        method: "get",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
        },
      }
    );
    const data = await ranking.json();
    res.status(200).json({ data });
  } catch (error) {
    console.error(error);
  }
});

app.get("/matches", async function (req, res) {
  try {
    const matches = await db.collection('matches').get();
    var data = [];
    matches.forEach((doc) => {
      data.push(doc.data());
    })
    res.status(200).json({ data: data });
  } catch (error) {
    console.error(error);
  }
});

app.post("/stats", async function (req, res) {
  try {
    const ranking = await fetch(
      `http://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2?key=540CB51BC4C0450F8F3A95EB92606DAC&steamid=${req.body.id}&appid=730`,
      {
        method: "get",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,PATCH,OPTIONS",
        },
      }
    );
    const data = await ranking.json();
    res.status(200).json({ data });
  } catch (error) {
    console.error(error);
  }
});

app.listen(10000);

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/");
}
