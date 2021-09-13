//web-worker.js
importScripts('https://unpkg.com/@tensorflow/tfjs');
tf.setBackend('cpu');

const prisoners_url = 'prisoners-weights_manifest.json';
const beauty_url = "beauty-weights_manifest.json";

let prisoners_model;
let beauty_model;
let dictionary;

const setup = async () => {
    try {
      model = await tf.loadGraphModel(MODEL_URL, { fromTFHub: true });
      const response = await tf.util.fetch(DICT_URL);
      const text = await response.text();
      dictionary = text.trim().split('\n');
    } catch(err) {
      console.error("Can't load model: ", err)
    }
    
    const zeros = tf.zeros([1, 224, 224, 3]);
    // warm-up the model
    model.predict(zeros);
    postMessage({ modelIsReady: true});
  }
  
  setup();
  
  onmessage = evt => {
    if (model) {
      predict(evt.data);
    }
  }
  
  const predict = async function(imageData) {
    const scores = tf.tidy(() => {
      const imgAsTensor = tf.browser.fromPixels(imageData);
      const centerCroppedImg = centerCropAndResize(imgAsTensor);
      const processedImg = centerCroppedImg.div(127.5).sub(1);
      return model.predict(processedImg);
    })
  
    const probabilities = await scores.data();
    scores.dispose();
    const result = Array.from(probabilities)
                       .map((prob, i) => ({label: dictionary[i], prob}));
  
    const prediction = result.reduce(function(prev, current) {
      return (prev.prob > current.prob) ? prev : current
    })
  
    postMessage([prediction.label, parseFloat(prediction.prob.toFixed(2))]);
  }