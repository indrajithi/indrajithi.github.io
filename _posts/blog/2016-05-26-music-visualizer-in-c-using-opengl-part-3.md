---
layout: post
title: Music Visualizer in C++ Using OpenGL Part 3
modified:
categories: blog
excerpt:
tags: []
image:
  feature:
date: 2016-05-26T12:59:15+05:30
---
We have to initialize the resources for OpenGL to plot the spectrum.

{% highlight c++ %}

int init_resources() {

	timestamp_t t0 = get_timestamp();
	program = create_program("graph.v.glsl", "graph.f.glsl");
	if (program == 0)
		return 0;

	attribute_coord1d = get_attrib(program, "coord1d");
	uniform_offset_x = get_uniform(program, "offset_x");
	uniform_scale_x = get_uniform(program, "scale_x");
	uniform_mytexture = get_uniform(program, "mytexture");

	if (attribute_coord1d == -1 || uniform_offset_x == -1 || uniform_scale_x == -1 || uniform_mytexture == -1)
		return 0; 

	//gets N/2 values in to graph
	getData();
	calledFromInit = !calledFromInit;
	/* Upload the texture with our datapoints */
	glActiveTexture(GL_TEXTURE0);
	glGenTextures(1, &texture_id);
	glBindTexture(GL_TEXTURE_2D, texture_id);
	glTexImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE, 2048, 1, 0, GL_LUMINANCE, GL_UNSIGNED_BYTE, graph);

	// Create the vertex buffer object
	glGenBuffers(1, &vbo);
	glBindBuffer(GL_ARRAY_BUFFER, vbo);

	// Create an array with only x values.
	GLfloat line[101];

	// Fill it in just like an array
	for (int i = 0; i < 101; i++) {
		line[i] = (i - 50) / 50.0;
	}

	// Tell OpenGL to copy our array to the buffer object
	glBufferData(GL_ARRAY_BUFFER, sizeof line, line, GL_STATIC_DRAW);

	// Enable point size control in vertex shader
#ifndef GL_ES_VERSION_2_0
	glEnable(GL_VERTEX_PROGRAM_POINT_SIZE);
#endif

	//return 1;

	timestamp_t t1 = get_timestamp();
	double secs = (t1 - t0) / 1000000.0L;
	std::cout<<"iinit init_resources total time: "<<secs<<std::endl;
	return 1;
}
{% endhighlight %}

`getFft()` is the function we use to apply *FFT*. Lets create that function.

{% highlight c++ %}
void getFft(const kiss_fft_cpx in[N], kiss_fft_cpx out[N])
{
  kiss_fft_cfg cfg;

 

  if ((cfg = kiss_fft_alloc(N, 0/*is_inverse_fft*/, NULL, NULL)) != NULL)
  {
    size_t i;

    kiss_fft(cfg, in, out);
    free(cfg);

   } 
  else
  {
    printf("not enough memory?\n");
    exit(-1);
  }

}
{% endhighlight %}


Now lets create `getData()` function which does all the work of getting N samples, applying window function,
applying FFT and storing in an array `graph` so that OpenGL can plot the points. `timestamp_t t0` gets the current time. This will be useful to find the total execution time.

Input audio name is stored as `fileName` to open it using *Aquila* with the name we use `Aquila::WaveFile wav(fileName);` . `mag[N/2]` stores the magnitude values after applying FFT. `roof` stores the total samples count. 


{% highlight c++ %}

void getData()
{
	int i,j,x;

	timestamp_t t0 = get_timestamp();
	
	Aquila::WaveFile wav(fileName);
	double mag[N/2];
	double roof = wav.getSamplesCount();


{% endhighlight %}

Lets collect N samples from the audio input. Initialize `i = framePointer` and `j = 0`. Initially `framePointer` value is zero. We will update the `framePointer` when one frame is fetched. Iterate the loop to take `N` samplings
until the `framePointer < roof -N`. Note that `roof` is the total sample count. `in[i].r` is the real part and `in[j].i` is the imaginary part. Since we don't have any imaginary part in the samples we will set the imaginary part of the input to zero.

Apply Window Function on the input. We are using **[Hann Window](https://en.wikipedia.org/wiki/Hann_function)** function on the input. 

{% highlight c++ %}
//Get first N samples
	for( i = framePointer, j = 0; i < (framePointer + N)
					&& framePointer < roof - N ; i++,j++  ){

		//Apply window function on the sample
		double multiplier = 0.5 * (1 - cos(2*M_PI*j/(N-1)));
		in[j].r = multiplier * wav.sample(i);
		in[j].i = 0;  //stores N samples 
	}
	
{% endhighlight %}

Update the frame pointer if `framePointer < roof-N -1`. Else print the values and exit.

{% highlight c++ %}
if(framePointer < roof-N -1){
		framePointer = i;

	}
	else {
		
		timestamp_t t1 = get_timestamp();
		double secs = (t1 - tmain) / 1000000.0L;

		sf::Time musicPlayingOffset = music.getPlayingOffset();
		
		unsigned int musicSampleRate = music.getSampleRate();

		int musicLeftToPlay = totalMusicDuration.asMilliseconds() - musicPlayingOffset.asMilliseconds();

		std::cout<<"N = "<<N<<std::endl;
		std::cout<<"Frame pointer > roof - N"<<std::endl;
		std::cout<<"Framepointer = "<<framePointer<<std::endl;
		std::cout<<"Frames Left = "<<roof - framePointer<<std::endl;
		std::cout<<"Total exec time: "<<secs<<std::endl;
		std::cout<<"Total Music Played Duration = "<<musicPlayingOffset.asMilliseconds()<<std::endl;
		std::cout<<"Music left to play = "<<musicLeftToPlay<<std::endl;
		std::cout<<"SFML Sample Rate = "<<musicSampleRate<<std::endl;  
		
		exit(0);
	}
{% endhighlight %}

Now we have N samples with us, we need to apply *FFT* on the samples. `getFft()` is the function that we created to apply *FFT*.  We then calculate magnitude of first n/2 FFT and store in `mag[N/2]`. Optionally you can convert it into dB scale by `10 * log10(mag)`. Log magnitude values are stored in `graph[]` to plot the points.

{% highlight c++ %}
	getFft(in,out);

	// calculate magnitude of first n/2 FFT
	for(i = 0; i < N/2; i++ ){
		mag[i] = sqrt((out[i].r * out[i].r) + (out[i].i * out[i].i));
	
		//	x =   10 * log10(mag[i]) ;
	
		graph[i] = log(mag[i]) *10;	
	}

{% endhighlight %}

Now we can plot the points in `graph[]` which we generated using OpenGL. 

{% highlight c++ %}
if(!calledFromInit)
	{
	
	glTexImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE, 2048, 1, 0, GL_LUMINANCE, GL_UNSIGNED_BYTE, graph);

	// Create the vertex buffer object
	glGenBuffers(1, &vbo);
	glBindBuffer(GL_ARRAY_BUFFER, vbo);

	// Create an array with only x values.
	GLfloat line[101];

	// Fill it in just like an array
	for (int i = 0; i < 101; i++) {
		line[i] = (i - 50) / 50.0;
	}

	// Tell OpenGL to copy our array to the buffer object
	glBufferData(GL_ARRAY_BUFFER, sizeof line, line, GL_STATIC_DRAW);

	// Enable point size control in vertex shader
#ifndef GL_ES_VERSION_2_0
	glEnable(GL_VERTEX_PROGRAM_POINT_SIZE);
#endif
	} 


{% endhighlight %}

**[Part 4](/blog/music-visualizer-in-c-using-opengl-part-4/)**

**[Full Source Code.](https://github.com/indrajithi/Audio-Visualizer)**