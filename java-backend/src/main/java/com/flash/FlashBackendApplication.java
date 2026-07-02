package com.flash;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

// We configure DataSources manually (two databases), so disable auto-config
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class FlashBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlashBackendApplication.class, args);
    }
}
