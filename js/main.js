const prisoners_url = 'weights/prisoners-weights_manifest.json';
const beauty_url = 'weights/beauty-weights_manifest.json';
// const beauty_url = "beauty_custom-weights_manifest.json";
let dictionary = null;
let webWorker_1 = null;
let webWorker_2 = null;
let workerPrisonerIsReady = false;
let isWaitingPrisoner = false;
let workerBeautyIsReady = false;
let isWaitingBeauty = false;

let prisoners_model = null;
let prisoners_model_ready = false;
let beauty_model = null;
let beauty_model_ready = false;
let beauty_history_max = 5;

let last_expected_job = null;
let last_expected_salary = null;
let last_expected_criminality = null;
let last_expected_ps = null;

let already_accepted_conditions = false;
//window.Worker

console.log(location.pathname);
//$("#cover_init").show()

const setUpPrisonersModel = async function () {
  if (false) {
    //window.Worker
    console.log('Prisoner to web-worker');
    webWorker_1 = new Worker('js/web-worker-prisoner.js');
    webWorker_1.onmessage = (evt) => {
      isWaitingPrisoner = !isWaitingPrisoner;
      if (evt.modelIsReady) {
        workerPrisonerIsReady = true;
      }
      console.log(evt.data);
    };
  } else {
    try {
      console.log('Loading prisoners model...');
      prisoners_model = await tf.loadLayersModel(prisoners_url);
    } catch (err) {
      console.error("Can't load model: ", err);
    }
    const zeros = tf.zeros([1, 224, 224, 3]);
    // warm-up the model
    console.log('warming up prisoners model');
    //prisoners_model.predict(zeros);
    prisoners_model_ready = true;
  }
};
const setUpBeautyModel = async function () {
  if (false) {
    //window.Worker
    webWorker_2 = new Worker('web-worker.js');
    webWorker_2.onmessage = (evt) => {
      isWaitingBeauty = !isWaitingBeauty;
      if (evt.modelIsReady) {
        workerBeautyIsReady = true;
      }
      console.log(evt.data);
    };
  } else {
    try {
      console.log('Loading beauty model...');
      beauty_model = await tf.loadLayersModel(beauty_url);
    } catch (err) {
      console.error("Can't load model: ", err);
    }
    const zeros = tf.zeros([1, 224, 224, 3]);
    // warm-up the model
    console.log('Warming up beauty model');
    //beauty_model.predict(zeros);
    beauty_model_ready = true;
  }
};

let forwardTimes = [];
// let predictedAges = []
let previousResults = [];
let detectedFaces = [];
let withBoxes = true;
let withLandmarks = false;

var prisoner_running = false;
var prisoner_promise = '';
var prisoner_label = 'Calculando...';

var beauty_running = false;
var beauty_promise = '';
var beauty_label = 'Calculando...';

// genders evaluated by model
var genderMap = { male: 'Male', female: 'Female' };

//expressions evaluated
var exprMap = {
  neutral: 'Neutral',
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  fearful: 'Fearful',
  disgusted: 'Disgusted',
  surprised: 'Surprised',
};

//possible jobs
var jobs = {
  0: { male: 'Unemployed', female: 'Unemployed' },
  1: { male: 'Unemployed', female: 'Unemployed' },
  2: { male: 'Unemployed', female: 'Unemployed' },
  3: { male: 'Bricklayer', female: 'Bricklayer' },
  4: { male: 'Trainee', female: 'Trainee' },
  5: { male: 'Consultant', female: 'Consultat' },
  6: { male: 'Engineer', female: 'Engineer' },
  7: { male: 'Manager', female: 'Manager' },
  8: { male: 'Director', female: 'Director' },
  9: { male: 'CEO', female: 'CEO' },
  10: { male: 'CEO', female: 'CEO' },
  100: { male: 'No data yet', female: 'No data yet' }
};

//memories to keep smooth values
var beauty_last_values = [2.5];
var prisoner_last_values = [0];
var personal_score_last_values = [];
var memory = 20;
var count_down = 'not_yet';
var shown_message = false;
var everything_loaded = false;
var check_text_area = false;

// Hide/Show bounding box
function onChangeHideBoundingBoxes(e) {
  withBoxes = $(e.target).prop('checked');
}

// Hide/Show landmarks
function onChangeHideLandmarks(e) {
  withLandmarks = $(e.target).prop('checked');
}

// Update time and fps values
function updateTimeStats(timeInMs) {
  forwardTimes = [timeInMs].concat(forwardTimes).slice(0, 30);
  const avgTimeInMs = forwardTimes.reduce((total, t) => total + t) / forwardTimes.length;
  $('#time').val(`${Math.round(avgTimeInMs)} ms`);
  $('#fps').val(`${faceapi.utils.round(1000 / avgTimeInMs)}`);
}

// Check if the button was pressed 15 seconds ago. If so, message is triggered
function checkCountDown(timeInMs) {
  if (timeInMs > 15000 && shown_message == false) {
    show_message();
    shown_message = true;
    check_text_area = true;
  }
}

// Updates persona score based in a formula where age, emotion, beauty and prisoner are weighted
function updatePersonalScores(age, emotion, beauty, prisoner, gender) {
  //var expression_score = {'Neutral': 4, 'Feliz': 5, 'Triste': 2, 'Enfadado': 0, 'Asustado': 1, 'Disgustado': 2, 'Sorprendido': 3}
  var expression_score = {
    Neutral: 6,
    Happy: 15,
    Sad: 3,
    Angry: 0,
    Fearful: 1,
    Upset: 2,
    Surprised: 5,
  };

  // Weighted age
  if (age == 0) {
    age_weight = 10;
  } else {
    age_weight = ((10000 * 1) / Math.pow(age, 2)) * 1.25; // the limit is 20

    if (age_weight > 20) {
      age_weight = 20;
    }
  }

  expr_weight = expression_score[emotion];

  //Weighted beauty
  if (beauty == 0) {
    beauty_weight = 15;
  } else if (isNaN(beauty)) {
    beauty_weight = 15;
  } else {
    beauty_weight = beauty * 6;
  }

  //Weighted prisoner
  prisoner_weight = prisoner * 30;

  //personal score summatory
  personal_score = age_weight + expr_weight + beauty_weight + prisoner_weight;

  if (personal_score < 0){
    personal_score = 0;
  }

  // personal_score_last_values works as a memory to stabilize values
  if (!isNaN(personal_score)) {
    personal_score_last_values.push(personal_score);
  }

  //Smooth personal score
  if (personal_score_last_values.length > memory) {
    last_personal = personal_score_last_values.slice(-memory);
    sum_personal = last_personal.reduce((a, b) => a + b, 0);
    personal_to_print = sum_personal / memory;
  } else {
    if (personal_score_last_values.length >= 1) {
      personal_to_print = personal_score_last_values.slice(-1)[0];
    } else {
      personal_to_print = 50.0;
    }
  }

  base = Math.floor(personal_to_print / 10);

  if (isNaN(base)) {
    base = 0;
  }

  if (!typeof gender == 'string') {
    gender = 'female';
  }

  personal_score_text = faceapi.utils.round(personal_to_print, 1)
  try{
    last_expected_salary = faceapi.utils.round(personal_to_print * personal_to_print * 8, 1)
    last_expected_ps = personal_score_text
    last_expected_job = jobs[base][gender]
  } catch (error){
    last_expected_job = jobs[1]["male"]
  }

  //$('#personal_score').val(`${faceapi.utils.round(personal_to_print, 1)} points`)
  $('#personal_score').text(`${personal_score_text} points`);
  $('#personal_score').css('color', perc2color(personal_to_print));
  $('#salary_button').css('background-color', perc2color(personal_to_print));
  $('#estimated_salary').val(`${last_expected_salary} $/year`);
  $('#estimated_job').val(`${last_expected_job}`);
}

function interpolateAgePredictions(age) {
  predictedAges = [age].concat(predictedAges).slice(0, 30);
  const avgPredictedAge = predictedAges.reduce((total, a) => total + a) / predictedAges.length;
  return avgPredictedAge;
}

//Prisoner predictions
async function predictPrisoners(videoEl, faceImages) {
  if (faceImages.length > 0) {
    const scores = tf.tidy(() => {
      return faceImages.map(function (img) {
        const face = tf.browser.fromPixels(img);
        const resized_image = tf.reshape(tf.image.resizeBilinear(face, [64, 64]), [-1, 64, 64, 3]);
        if (prisoners_model_ready) {
          try {
            const prediction = prisoners_model.predict(resized_image);
            return prediction.dataSync()[0];
          } catch (error) {
            console.log(error);
          }
        }
      });
    });
    return scores;
  }
}

//WebWorker approach
async function predictPrisonersWebWorker(faceImages) {
  if (!isWaitingPrisoner && !workerPrisonerIsReady) {
    obj = JSON.parse(JSON.stringify(faceImages));
    webWorker_1.postMessage(obj);
    isWaitingPrisoner = !isWaitingPrisoner;
    webWorker_1.onmessage = function (event) {
      const prediction = event.data;
      console.log(prediction);
    };
    isWaitingPrisoner = !isWaitingPrisoner;
  }
}

//Beauty predictions
async function predictBeauty(videoEl, faceImages) {
  if (faceImages.length > 0) {
    const scores = tf.tidy(() => {
      return faceImages.map(function (img) {
        const face = tf.browser.fromPixels(img);
        const resized_image = tf.reshape(tf.image.resizeBilinear(face, [64, 64]), [-1, 64, 64, 3]);
        if (beauty_model_ready) {
          try {
            const prediction = beauty_model.predict(resized_image);
            return prediction.dataSync();
          } catch (error) {
            console.log(error);
          }
        }
      });
    });
    return scores;
  }
}

async function onPlay() {
  const videoEl = $('#inputVideo').get(0);

  if (videoEl.paused || videoEl.ended || !isFaceDetectionModelLoaded())
    return setTimeout(() => onPlay());

  const options = getFaceDetectorOptions();

  change_loading_message("Loading detection models...");
  const results = await faceapi
    .detectAllFaces(videoEl, options)
    .withFaceLandmarks()
    .withFaceExpressions()
    .withAgeAndGender();
  
  
  const ts = Date.now();

  updateTimeStats(Date.now() - ts);

  //15 seconds count down after pressing salary button
  if (!(typeof count_down == 'string')) {
    checkCountDown(Date.now() - count_down);
  }

  //Check if user is writting in text area for feedback
  if (check_text_area){
    check_if_change_button_text()
  }

  var lastDetectedFaces = [];

  if (results) {
    const canvas = $('#overlay').get(0);
    const dims = faceapi.matchDimensions(canvas, videoEl, true);

    const resizedResults = faceapi.resizeResults(results, dims);
    const minConfidence = 0.05;
  
    if (withBoxes) {
      faceapi.draw.drawDetections(canvas, resizedResults);
    }
    if (withLandmarks) {
      faceapi.draw.drawFaceLandmarks(canvas, resizedResults);
    }

    const regionsToExtract = resizedResults.map(function (result) {
      return new faceapi.Rect(
        result.detection.box.x,
        result.detection.box.y,
        result.detection.box.width,
        result.detection.box.height
      );
    });
    const faceImages = await faceapi.extractFaces(videoEl, regionsToExtract);
    
    //PREDICTIONS

    if (false) {
      //window.Worker
      //setInterval(predictPrisonersWebWorker(faceImages), 1000)
      predictPrisonersWebWorker(faceImages);
    } else {
      const prisoner_promise = predictPrisoners(videoEl, faceImages);
      await prisoner_promise;
      prisoner_promise.then(function (prediction) {
        try {
          prisoner_final_value = 1 - prediction[0];
          //console.log(prediction)
          //prisoner_final_value = NaN;
          prisoner_last_values.push(prisoner_final_value);
        } catch (error) {}
      });
    }

    const beauty_promise = predictBeauty(videoEl, faceImages);

    await beauty_promise;

    beauty_promise.then(function (prediction) {
      try {
        beauty_final_value = prediction[0][0];

        if (beauty_final_value > beauty_history_max){
          beauty_history_max = beauty_final_value;
        }

        // We scale 3-5 original values to 1-5 values. Below 3 every values is 1
        
        if (beauty_final_value < 3){
          beauty_final_value = 1
        } else{
          beauty_final_value = (((5-1) * (beauty_final_value - 3)) / (beauty_history_max - 3)) + 1 ;
        }
        //console.log(beauty_final_value);
        beauty_last_values.push(beauty_final_value);
      } catch (error) {}
    });

    if (!everything_loaded) {
      everything_ready();
    }

    resizedResults.forEach((result, i) => {
      //console.log(result)
      const { age, gender, genderProbability, expressions } = result;
      expr = Object.entries(expressions).reduce((a, b) => (a[1] > b[1] ? a : b));

      // interpolate gender predictions over last 30 frames
      // to make the displayed age more stable
      // const interpolatedAge = interpolateAgePredictions(age)
      var interpolatedAge = age;
      var detected = false;
      // console.log(detectedFaces.length)
      for (const face in detectedFaces) {
        var a = detectedFaces[face].detection.box.x - result.detection.box.x;
        var b = detectedFaces[face].detection.box.y - result.detection.box.y;
        if (Math.sqrt(a * a + b * b) < 40) {
          detected = true;
          detectedFaces[face]['ageHistory'] = [age]
            .concat(detectedFaces[face]['ageHistory'])
            .slice(0, 30);
          const avgPredictedAge =
            detectedFaces[face]['ageHistory'].reduce((total, a) => total + a) /
            detectedFaces[face]['ageHistory'].length;
          interpolatedAge = avgPredictedAge;
          lastDetectedFaces = lastDetectedFaces.concat(face);
          //console.log(detectedFaces[face])
        }
      }
      if (detected == false) {
        for (const face in previousResults) {
          var a = previousResults[face].detection.box.x - result.detection.box.x;
          var b = previousResults[face].detection.box.y - result.detection.box.y;
          if (Math.sqrt(a * a + b * b) < 40) {
            result['ageHistory'] = [age];
            detectedFaces = [result].concat(detectedFaces);
          }
        }
      }

      var pr_label = 'Criminal';
      var cl_label = 'Famoso';


      if (beauty_last_values.length > memory) {
        last_beautys = beauty_last_values.slice(-memory);
        sum_beauty = last_beautys.reduce((a, b) => a + b, 0);
        beauty_to_print = sum_beauty / memory;
      } else {
        beauty_to_print = beauty_last_values[beauty_last_values.length - 1];
      }
      
      //Bad connection may start inference with beauty model not loaded. If so, 
      if (Number.isNaN(beauty_to_print)){
        beauty_to_print = 2.5;
      }

      if (prisoner_last_values.length > memory) {
        last_prisoners = prisoner_last_values.slice(-memory);
        sum_prisoner = last_prisoners.reduce((a, b) => a + b, 0);
        prisoner_to_print = sum_prisoner / memory;
        
      } else {
        prisoner_to_print = prisoner_last_values[prisoner_last_values.length - 1];
      }

      //Biggest model is prisoner => If not loaded yet, we assumed 0 until is loaded
      if (Number.isNaN(prisoner_to_print)){
        prisoner_to_print = 0.0;
      }

      $('#age_value').val(`${faceapi.utils.round(interpolatedAge, 0)}`);
      $('#gender_value').val(`${genderMap[gender]}`);
      $('#expression_value').val(`${exprMap[expr[0]]}`);
      $('#beauty_value').val(`${faceapi.utils.round(beauty_to_print / 5, 2) * 100} %`);
      $('#criminal_value').val(`${faceapi.utils.round(prisoner_to_print) * 100} %`);
      last_expected_criminality = faceapi.utils.round(prisoner_to_print) * 100

      updatePersonalScores(
        interpolatedAge,
        exprMap[expr[0]],
        beauty_to_print,
        1 - (prisoner_to_print * 2),
        gender
      );
    });

    previousResults = resizedResults;
    var tempDetectedFaces = [];
    if (lastDetectedFaces.length > 0) {
      for (const face in lastDetectedFaces) {
        tempDetectedFaces = tempDetectedFaces.concat(detectedFaces[face]);
      }
      detectedFaces = tempDetectedFaces;
    }
  }
  setTimeout(() => onPlay());
}

async function run() {
  // load face detection and face expression recognition models
  //await changeFaceDetector('/weights/tiny_face_detector')
  await changeFaceDetector(TINY_FACE_DETECTOR);

  await faceapi.loadFaceLandmarkModel('./weights');
  await faceapi.loadFaceExpressionModel('./weights');
  await faceapi.nets.ageGenderNet.load('./weights');

  changeInputSize(224);
  setUpPrisonersModel();
  setUpBeautyModel();

  // try to access users webcam and stream the images
  // to the video element
  // while (!already_accepted_conditions) {
  //   n = 1
  // }
  // const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
  // const videoEl = $('#inputVideo').get(0);
  // videoEl.srcObject = stream;
  
}

//controling execution if accepted conditions
async function run_cam(){
  if (already_accepted_conditions){
    console.log("Accepted conditions")
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    const videoEl = $('#inputVideo').get(0);
    videoEl.srcObject = stream;
    change_loading_message("Calibrating camera...");
  }
}

$(document).ready(function () {
  run();  
});


//Models loaded => we hide and show some buttons
function everything_ready() {
  $('#cover').hide();
  bounding_check_box = $('#hideBoundingBoxesCheckbox');
  bounding_check_box.prop('checked', true);
  $("#check-buttons").hide();
  $("#face_metrics").show();
  everything_loaded = true;
  
}

//ethics message + summary
function show_message() {
  $('#cover_comments_plus_final_salary').show();
  document.getElementById( 'salary_job_definitive' ).style.display = 'flex';
  $('#estimated_salary_definitive').val(
    `${last_expected_salary} $/year`
  );
  $('#estimated_job_definitive').val(`${last_expected_job}`);
  $('#estimated_criminal_definitive').val(`${last_expected_criminality} %`);
  $('#estimated_ps_definitive').val(`${last_expected_ps} points`);
  $('#text-area-div-first').show();
  //$('#cover_ai_message').show();

  var percentil = "70%";
  var percentil_num = 70;

  if (last_expected_ps == 70){
    percentil_num = 70;

  } else if (last_expected_ps < 50){
    percentil_num = last_expected_ps * (70/50);
    
  } else{
    percentil_num = 70 + (last_expected_ps - 50)*(30/50)
  }

  percentil_num = Math.round((percentil_num + Number.EPSILON) * 100) / 100;
  percentil_num = percentil_num.toString();
  percentil = percentil_num.concat("%");

  $(".bar__points").css("width", percentil);
  $("#ahead_of").text(`You are ahead of ${percentil} people`);

  if (last_expected_ps >= 80){
    ahead_message = "You are just perfect!";
  } else if (60 <= last_expected_ps && last_expected_ps < 80){
    ahead_message = "You are OK";
  } else if (40 <= last_expected_ps && last_expected_ps < 60){
    ahead_message = "Elegible for pretty basic job roles";
  } else if (20 <= last_expected_ps && last_expected_ps < 40){
    ahead_message = "Poor profile";
  } else {
    ahead_message = "Very poor profile";
  }
  $(".main__comments__final-msg__score__profile").text(ahead_message);


  
  
}

function open_comments() {
    $('#cover_comments').show();
    $('#text-area-div').show();
    
}

function close_message_cover(id_cover){
    $('#' + id_cover).hide();
    if (id_cover == "cover_ai_message"){
      $("#check-buttons").show();
    }
}

function close_init_message_and_start_test(){
  $('#cover_init').hide();
  already_accepted_conditions = true;
  run_cam();
}

//After see summary we can continue playing with the tool
function continue_playing(id_cover) {
  $('#' +  id_cover).hide();
  //count_down = 'not_again';

  var id_relations = {
    'cover_comments_plus_final_salary': { 'text': 'user-comment-first', 'radio-button': '' },
    'cover_comments': { 'text': 'user-comment', 'radio-button': '' }
  };
  
  text_id =id_relations[id_cover]['text']
  send_comment(text_id);
  
  //If we came from summary view, we show message and perform fake request to show 404 in console
  if (id_cover != 'cover_comments') {
    $('#cover_ai_message').show();
    message = "Artificial Intelligence without Ethics is not Intelligence"
    var response = $.get(message.split(' ').join('_'), function (data, status) {
      console.log(status);
    });
    console.log(message);
  }

  // Stop checking if text area is changing in case continue_playing event comes from "cover_comments_plus_final_salary"
  if (id_cover == "cover_comments_plus_final_salary"){
    check_text_area = false;
  }

}

function hide_show() {
  var x = $('#salary_job');
  var btn = $('#salary_button');
  x.css('display', 'flex');
  btn.css('display', 'none');

  if (typeof count_down == 'string') {
    if (count_down == 'not_yet') {
      console.log("Started countdown");
      count_down = Date.now();
    }
  }
}

//Post to api
function send_comment(text_id) {
  var api_gateway_url = 'https://a1x7dncy4h.execute-api.eu-west-1.amazonaws.com/prod/put-opinion';

  const comment = $('#' + text_id).val().trim();
  var radio_button = "None";
  var personal_score = last_expected_ps;

  //If we came from summary view we have radio buttons
  
  if (text_id == "user-comment-first"){
    
    //Check if any radio button is checked
    if (typeof $('input:radio[name=group1]:checked').val() != "undefined") {
      radio_button = $('input:radio[name=group1]:checked').val();
    }
  }

  // If the user introduce any kind of feedback we collect it and push it to the DB
  if (comment != '' || radio_button != 'None') {
    const data_dict = {
      comment: comment,
      radio_button: radio_button,
      personal_score: personal_score
    };
    var data = JSON.stringify(data_dict);
    var response = $.post(api_gateway_url, data, function (data, status) {
      console.log(status);
    });
    console.log(response);
  }
}

function check_if_change_button_text(){
  const comment = $("#user-comment-first").val().trim();
  if (comment != '') {
    $("#replay_btn_feedback").html("submit and see deeper analysis");
  } else{
    $("#replay_btn_feedback").html("see deeper analysis");
  }
}

//Gradient colour for button
function perc2color(perc) {
  var r,
    g,
    b = 0;
  if (perc < 50) {
    r = 255;
    g = Math.round(5.1 * perc);
  } else {
    g = 255;
    r = Math.round(510 - 5.1 * perc);
  }
  var h = r * 0x10000 + g * 0x100 + b * 0x1;
  return '#' + ('000000' + h.toString(16)).slice(-6);
}

function change_loading_message(new_message){
  $("#loading_msg").html(new_message)
}

//cookies information
function open_modal(){
  var modal = $("#myModal");
  modal.css('display', 'block');

}

//Closing cookies information
function close_modal(){
  var modal = $("#myModal");
  modal.css('display', 'none');

}


// RRSS Functions
function share_whatsapp(){
  if ($(window).width() > 669){
    //window.open('https://web.whatsapp.com://send?text=Check out this new AI tool www.aida9000.com');
    window.open('https://api.whatsapp.com/send?text=Check out this new AI tool: www.aida9000.com');
    
  } else{
    window.open('whatsapp://send?text=Check out this new AI tool www.aida9000.com');
  }
}

function share_linkedin(){

  var articleUrl = "https://www.aida9000.com/";
  var articleTitle = "Artificial Intelligence Definitive Analyzer";
  var articleSummary = "Check out this new AI tool";
  var articleSource = "aida9000.com"
  var url = `https://www.linkedin.com/shareArticle?mini=true&url=${articleUrl}&title=${articleTitle}&summary=${articleSummary}&source=${articleSource}`;
  window.open(url);
  //window.open('https://www.linkedin.com/shareArticle?mini=true&url=https://www.aida9000.com/&title=Artificial%20Intelligence%20Definitive%20Analyzer&summary=Check%20it%20out%20this%20new%20AI%20tool&source=www.aida9000.com')
}

function share_twitter(){
  var text = "Check out this new AI tool: www.aida9000.com";
  var url = `https://twitter.com/intent/tweet?text=${text}`;
  window.open(url);
}

function share_facebook(){
  var url_to_share = "https://www.aida9000.com";
  //var url = `https://www.facebook.com/dialog/share?app_id=145634995501895&display=popup&href=${url_to_share}`;
  var url = `https://www.facebook.com/sharer/sharer.php?u=${url_to_share}`;
  //https://www.facebook.com/sharer/sharer.php?u=example.org
  //&redirect_uri=RETURN_URL
  window.open(url);
}