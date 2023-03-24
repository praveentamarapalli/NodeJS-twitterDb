const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertDBDataToResponseData = (dbData) => {
  return {
    username: dbData.username,
    tweet: dbData.tweet,
    dateTime: dbData.date_time,
  };
};

const convertDBFollowingDataToResponseData = (dbData) => {
  return {
    name: dbData.name,
  };
};

const convertDBFollowersDataToResponseData = (dbData) => {
  return {
    name: dbData.name,
  };
};

//Authenticate jwtToken
const authenticateJwtToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "abbcccdddd", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-1 Register User
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
    SELECT
    *
    FROM
        user
    WHERE
        username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
                INSERT INTO
                    user (username, password, name, gender)
                VALUES
                (
                    '${username}',
                    '${hashedPassword}',
                    '${name}',
                    '${gender}'
                );`;
      await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API-2 Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT
    *
    FROM
        user
    WHERE
        username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "abbcccdddd");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3 Get tweet details
app.get(
  "/user/tweets/feed/",
  authenticateJwtToken,
  async (request, response) => {
    const getTweetsQuery = `
    select 
        tweet.tweet_id,
        tweet.user_id,
        user.username,
        tweet.tweet,
        tweet.date_time
    from 
        follower
        left join tweet on tweet.user_id = follower.following_user_id
        left join user on follower.following_user_id = user.user_id
    where 
        follower.follower_user_id = (select user_id from user where username = "${request.username}")
    order by 
        tweet.date_time desc
    limit 4;`;
    const tweetDetails = await database.all(getTweetsQuery);
    response.send(
      tweetDetails.map((eachTweet) => convertDBDataToResponseData(eachTweet))
    );
  }
);

//API-4 Get following
app.get("/user/following/", authenticateJwtToken, async (request, response) => {
  const getFollowingQuery = ` 
    select 
        user.name
    from 
        follower
        left join user on follower.following_user_id = user.user_id
    where 
        follower.follower_user_id = (select user_id from user where username = "${request.username}");
  `;
  const followingDetails = await database.all(getFollowingQuery);
  response.send(
    followingDetails.map((eachFollowing) =>
      convertDBFollowingDataToResponseData(eachFollowing)
    )
  );
});

//API-5 Get followers
app.get("/user/followers/", authenticateJwtToken, async (request, response) => {
  const getFollowersQuery = `
    select 
        user.name
    from 
        follower
        left join user on follower.follower_user_id = user.user_id
    where 
        follower.following_user_id = (select user_id from user where username = "${request.username}");`;
  const followersDetails = await database.all(getFollowersQuery);
  response.send(
    followersDetails.map((eachFollower) =>
      convertDBFollowersDataToResponseData(eachFollower)
    )
  );
});

const convertDBTweetDataToResponseData = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

//API-6 Get tweet
const follows = async (request, response, next) => {
  const { tweetId } = request.params;
  let isFollowing = await database.get(`
      select 
      * 
      from 
        follower
      where
        follower_user_id =  (select user_id from user where username = "${request.username}")
        and 
        following_user_id = (select user.user_id from tweet natural join user where tweet_id = ${tweetId});
      `);
  if (isFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet, date_time } = await database.get(`
      select tweet,date_time from tweet where tweet_id = ${tweetId};`);
    const { likes } = await database.get(`
        select count(like_id) as likes from like where tweet_id = ${tweetId};`);
    const { replies } = await database.get(`
        select count(reply_id) as replies from reply where tweet_id = ${tweetId};`);
    response.send({ tweet, likes, replies, dateTime: date_time });
  }
);

//API-7 Get likes
app.get(
  "/tweets/:tweetId/likes/",
  authenticateJwtToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const likedBy = await database.all(`
        select 
            user.username 
        from
            like natural join user
        where 
            tweet_id = ${tweetId};`);
    response.send({ likes: likedBy.map((item) => item.username) });
  }
);

//API-8 Get replies
app.get(
  "/tweets/:tweetId/replies/",
  authenticateJwtToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
    select 
        user.name, reply.reply 
    from
        reply natural join user
    where 
        tweet_id = ${tweetId};`;
    const repliesDetails = await database.all(getRepliesQuery);
    response.send({ repliesDetails });
  }
);

//API-9 Get user tweets
app.get("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const myTweetsQuery = `
    select 
        tweet.tweet,
        count(distinct like.like_id) as likes,
        count(distinct reply.reply_id) as replies,
        tweet.date_time
    from
        tweet
        left join like on tweet.tweet_id = like.tweet_id
        left join reply on tweet.tweet_id = reply.tweet_id
    where 
        tweet.user_id = (select user_id from user where username = "${request.username}")
    group by 
        tweet.tweet_id;`;
  const myTweets = await database.all(myTweetsQuery);
  response.send(
    myTweets.map((item) => {
      const { date_time, ...rest } = item;
      return { ...rest, dateTime: date_time };
    })
  );
});

//API - 10 post a tweet
app.post("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const { tweet } = request.body;
  const username = request;
  const { userId } = await database.get(
    `select 
        user_id 
    from 
        user 
    where 
        username = "${request.username}"`
  );
  const postTweet = `
    INSERT INTO
        tweet (tweet, user_id)
    VALUES
    (
        '${tweet}',
        ${userId}
    );`;
  await postTweet;
  response.send("Created a Tweet");
});

//API-11 Delete tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const userTweetQuery = `
    select 
        tweet_id, user_id
    from 
        tweet 
    where 
        tweet_id = ${tweetId}
        and user_id = (select user_id from user where username = "${request.username}");`;
    const userTweet = await database.get(userTweetQuery);
    if (userTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
        DELETE FROM 
            tweet
        WHERE 
            tweet_id = ${tweetId}
        `;
      await database.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
