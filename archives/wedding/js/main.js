document.addEventListener('DOMContentLoaded', () => {


  // Set up FlipDown
  var flipdown = new FlipDown(1688725800, { theme: 'dark' })
    // Start the countdown
    .start()

    // Do something when the countdown ends
    .ifEnded(() => {
      console.log('The countdown has ended!');
    });

  let body = document.body
  body.classList.toggle('light-theme')
  body.querySelector('#flipdown').classList.toggle('flipdown__theme-dark');
  body.querySelector('#flipdown').classList.toggle('flipdown__theme-light');
  // Toggle theme
  // var interval = setInterval(() => {
  //   let body = document.body;
  //   body.classList.toggle('light-theme');
  //   body.querySelector('#flipdown').classList.toggle('flipdown__theme-dark');
  //   body.querySelector('#flipdown').classList.toggle('flipdown__theme-light');
  // }, 5000);

});
