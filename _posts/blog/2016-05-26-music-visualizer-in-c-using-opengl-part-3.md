---
layout: post
title: Music Visualizer in C++ Using OpenGL Part 2
modified:
categories: blog
excerpt:
tags: []
image:
  feature:
date: 2016-05-26T12:59:15+05:30
---

Now lets create `getData()` function which does all the work of getting N samples, applying window function,
applying FFT and storing in an array `graph` so that OpenGL can plot the points. `timestamp_t t0` gets the current time. This will be usefull to find the total execution time.

Input audio name is stored as `fileName` to open it using *Aquila* with the name wav use `Aquila::WaveFile wav(fileName);` . `mag[N/2]` stores the magnitude values after applying FFT. `roof` stores the total samples count. 


{% highlight c++ %}

void getData()
{
	int i,j,x;

	timestamp_t t0 = get_timestamp();
	
	Aquila::WaveFile wav(fileName);
	double mag[N/2];
	double roof = wav.getSamplesCount();


{% endhighlight %}